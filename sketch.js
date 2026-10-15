// ============================================================
// 請先替換成你的 Google Sheets 公開 CSV 網址
// 第一列標題必須固定為：question,optionA,optionB,optionC,optionD,answer
// ============================================================
const GOOGLE_SHEET_CSV_URL ="https://docs.google.com/spreadsheets/d/e/2PACX-1vSkvZnkYVk6veYQMzJJameeTnH_TSGDAB0FYWeECrRbi-ZBNluSm-CZ7OGuKoY8vkA-_LQSnzEBuKm4/pub?gid=282366407&single=true&output=csv";

// 每次測驗抽出的題數
const QUIZ_QUESTION_COUNT = 5;
const REQUIRED_QUESTION_COUNT = 15;

// p5 textFont() 使用單一 family 名稱
const CHINESE_FONT = "LXGW WenKai TC";
const ENGLISH_FONT = "Caveat";

// Google Sheets 題庫與載入狀態
let questionTable;
let questionBank = [];
let dataReady = false;
let fontReady = false;
let loadError = "";

// 本次測驗狀態
let questions = [];
let currentQuestion = 0;
let score = 0;
let answered = false;
let selectedOption = -1;
let quizFinished = false;

// 版面與按鈕
let optionButtons = [];
let nextButton = null;
let restartButton = null;
let canvasElement;
let questionCardHeight = 180;
let questionLineHeight = 32;

// 觸控防止同一次操作被滑鼠事件重複處理
let lastTouchTime = 0;
let lastHandledTouchTime = 0;
let lastHandledTouchX = -9999;
let lastHandledTouchY = -9999;

// ============================================================
// preload：從 Google Sheets 公開 CSV 載入題庫
// 每次重新整理都加入時間戳，避免瀏覽器使用舊快取。
// ============================================================
function preload() {
  const csvUrl = addCacheBustingQuery(GOOGLE_SHEET_CSV_URL);

  questionTable = loadTable(
    csvUrl,
    "csv",
    "header",
    csvLoaded,
    csvLoadFailed
  );
}

// 在原本網址後加入 cache-busting 時間戳
function addCacheBustingQuery(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}_=${Date.now()}`;
}

// Google Sheets CSV 成功載入
function csvLoaded(table) {
  try {
    validateCSVTable(table);

    questionBank = [];

    for (let rowIndex = 0; rowIndex < table.getRowCount(); rowIndex++) {
      const row = table.getRow(rowIndex);
      const displayRowNumber = rowIndex + 2;

      const question = cleanCSVValue(row.getString("question"));
      const optionA = cleanCSVValue(row.getString("optionA"));
      const optionB = cleanCSVValue(row.getString("optionB"));
      const optionC = cleanCSVValue(row.getString("optionC"));
      const optionD = cleanCSVValue(row.getString("optionD"));
      const answerText = cleanCSVValue(row.getString("answer"));
      const answer = Number(answerText);

      if (
        question === "" ||
        optionA === "" ||
        optionB === "" ||
        optionC === "" ||
        optionD === ""
      ) {
        throw new Error(`第 ${displayRowNumber} 列有空白欄位。`);
      }

      if (!Number.isInteger(answer) || answer < 0 || answer > 3) {
        throw new Error(
          `第 ${displayRowNumber} 列的 answer 必須是 0、1、2 或 3。`
        );
      }

      questionBank.push({
        question,
        options: [optionA, optionB, optionC, optionD],
        answer
      });
    }

    if (questionBank.length !== REQUIRED_QUESTION_COUNT) {
      throw new Error(
        `目前讀到 ${questionBank.length} 題；Google Sheets 題庫必須正好有 ${REQUIRED_QUESTION_COUNT} 題。`
      );
    }

    dataReady = true;
    loadError = "";
  } catch (error) {
    dataReady = false;
    loadError = error instanceof Error ? error.message : String(error);
    console.error("Google Sheets 題庫格式錯誤：", error);
  }
}

// Google Sheets CSV 載入失敗
function csvLoadFailed(error) {
  dataReady = false;
  loadError =
    "無法讀取 Google Sheets 題庫。請確認試算表已發布到網路、網址正確，且資料可供任何知道連結者檢視。";
  console.error("Google Sheets CSV 載入失敗：", error);
}

// 驗證標題列與題數
function validateCSVTable(table) {
  const requiredColumns = [
    "question",
    "optionA",
    "optionB",
    "optionC",
    "optionD",
    "answer"
  ];

  const actualColumns = (table.columns || []).map((column, index) => {
    const value = String(column).trim();
    return index === 0 ? value.replace(/^\uFEFF/, "") : value;
  });

  const hasCorrectHeader =
    actualColumns.length === requiredColumns.length &&
    requiredColumns.every(
      (column, index) => actualColumns[index] === column
    );

  if (!hasCorrectHeader) {
    throw new Error(
      `第一列標題必須依序為：${requiredColumns.join(",")}`
    );
  }

  if (table.getRowCount() !== REQUIRED_QUESTION_COUNT) {
    throw new Error(
      `資料列必須正好有 ${REQUIRED_QUESTION_COUNT} 題，目前有 ${table.getRowCount()} 列。`
    );
  }
}

// 清理 CSV 欄位內容
function cleanCSVValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).replace(/^\uFEFF/, "").trim();
}

// ============================================================
// Google Fonts 載入
// ============================================================
async function loadGoogleFonts() {
  if (!document.fonts || !document.fonts.load) {
    return;
  }

  try {
    await Promise.all([
      document.fonts.load(`400 16px "${CHINESE_FONT}"`),
      document.fonts.load(`400 16px "${ENGLISH_FONT}"`)
    ]);
  } catch (error) {
    console.warn("Google Fonts 載入失敗，將使用瀏覽器 fallback。", error);
  }
}

// p5.js 初始化
function setup() {
  canvasElement = createCanvas(
    max(320, windowWidth - 20),
    max(820, windowHeight - 20)
  );

  canvasElement.style("display", "block");
  canvasElement.style("margin", "0 auto");
  canvasElement.elt.style.touchAction = "manipulation";

  textAlign(CENTER, CENTER);
  textFont(CHINESE_FONT);

  if (dataReady) {
    startNewQuiz();
  }

  loadGoogleFonts().then(() => {
    fontReady = true;
    textFont(CHINESE_FONT);

    if (dataReady && questions.length === 0) {
      startNewQuiz();
    } else if (dataReady) {
      createResponsiveLayout();
    }
  });
}

// 開始新的測驗：從 15 題中隨機抽 5 題
function startNewQuiz() {
  if (!dataReady || questionBank.length !== REQUIRED_QUESTION_COUNT) {
    return;
  }

  questions = shuffle([...questionBank]).slice(0, QUIZ_QUESTION_COUNT);
  currentQuestion = 0;
  score = 0;
  answered = false;
  selectedOption = -1;
  quizFinished = false;

  createResponsiveLayout();
}

// 判斷是否使用單欄版面
function useSingleColumn() {
  return width < 560 || (width < height && width < 600);
}

// ============================================================
// 混合字型：中文使用 LXGW WenKai TC，英文與數字使用 Caveat
// ============================================================
function isChineseCharacter(character) {
  const code = character.codePointAt(0);

  return (
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x3040 && code <= 0x30ff)
  );
}

function isEnglishOrNumber(character) {
  return /[A-Za-z0-9]/.test(character);
}

function getCharacterFont(character) {
  if (isChineseCharacter(character)) {
    return CHINESE_FONT;
  }

  if (isEnglishOrNumber(character)) {
    return ENGLISH_FONT;
  }

  return CHINESE_FONT;
}

function splitTextByFont(message) {
  const segments = [];
  let currentFont = null;
  let currentText = "";

  for (const character of String(message)) {
    const characterFont = getCharacterFont(character);

    if (currentFont === null) {
      currentFont = characterFont;
      currentText = character;
    } else if (characterFont === currentFont) {
      currentText += character;
    } else {
      segments.push({ text: currentText, font: currentFont });
      currentFont = characterFont;
      currentText = character;
    }
  }

  if (currentText.length > 0) {
    segments.push({ text: currentText, font: currentFont });
  }

  return segments;
}

function measureMixedText(message, fontSize) {
  textSize(fontSize);

  let totalWidth = 0;

  for (const segment of splitTextByFont(message)) {
    textFont(segment.font);
    totalWidth += textWidth(segment.text);
  }

  textFont(CHINESE_FONT);
  return totalWidth;
}

function drawMixedText(message, centerX, centerY, fontSize) {
  textSize(fontSize);

  const segments = splitTextByFont(message);
  const totalWidth = measureMixedText(message, fontSize);
  let currentX = centerX - totalWidth / 2;

  for (const segment of segments) {
    textFont(segment.font);
    const segmentWidth = textWidth(segment.text);

    text(segment.text, currentX + segmentWidth / 2, centerY);
    currentX += segmentWidth;
  }

  textFont(CHINESE_FONT);
}

function wrapTextLines(message, maxWidth, fontSize) {
  const lines = [];
  let currentLine = "";

  for (const character of String(message)) {
    const testLine = currentLine + character;

    if (
      currentLine.length > 0 &&
      measureMixedText(testLine, fontSize) > maxWidth
    ) {
      lines.push(currentLine);
      currentLine = character;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

function drawWrappedText(
  message,
  centerX,
  centerY,
  maxWidth,
  lineHeight,
  fontSize
) {
  const lines = wrapTextLines(message, maxWidth, fontSize);
  const totalHeight = lines.length * lineHeight;
  const firstY = centerY - totalHeight / 2 + lineHeight / 2;

  for (let index = 0; index < lines.length; index++) {
    drawMixedText(
      lines[index],
      centerX,
      firstY + index * lineHeight,
      fontSize
    );
  }
}

// ============================================================
// 響應式版面
// ============================================================
function createResponsiveLayout() {
  if (!dataReady || questions.length === 0) {
    return;
  }

  const singleColumn = useSingleColumn();
  const margin = width < 480 ? 16 : 24;
  const contentWidth = width - margin * 2;
  const gap = width < 480 ? 14 : 20;
  const buttonHeight = width < 480 ? 72 : 80;
  const buttonWidth = singleColumn
    ? contentWidth
    : (contentWidth - gap) / 2;

  const questionFontSize = width < 480 ? 20 : 24;
  questionLineHeight = width < 480 ? 28 : 34;

  const questionLines = wrapTextLines(
    questions[currentQuestion].question,
    contentWidth - 28,
    questionFontSize
  );

  questionCardHeight = max(
    width < 480 ? 150 : 170,
    questionLines.length * questionLineHeight + 60
  );

  const firstOptionY = 110 + questionCardHeight + 76;
  optionButtons = [];

  for (let index = 0; index < 4; index++) {
    const column = index % 2;
    const row = floor(index / 2);
    const singleY = firstOptionY + index * (buttonHeight + gap);
    const doubleY = firstOptionY + row * (buttonHeight + gap);
    const buttonX = singleColumn
      ? margin
      : column === 0
      ? margin
      : margin + buttonWidth + gap;
    const buttonY = singleColumn ? singleY : doubleY;

    optionButtons.push({
      x: buttonX,
      y: buttonY,
      width: buttonWidth,
      height: buttonHeight,
      offsetX: 0,
      offsetY: 0
    });
  }

  const lastButton = optionButtons[optionButtons.length - 1];
  const optionsBottom = lastButton.y + lastButton.height;
  const actionWidth = min(240, contentWidth);
  const actionHeight = 54;

  nextButton = {
    x: width / 2 - actionWidth / 2,
    y: optionsBottom + 40,
    width: actionWidth,
    height: actionHeight
  };

  restartButton = {
    x: width / 2 - actionWidth / 2,
    y: height * 0.66,
    width: actionWidth,
    height: actionHeight
  };
}

// ============================================================
// 繪圖
// ============================================================
function draw() {
  background("#f4f1ea");

  if (loadError !== "") {
    drawStatusScreen(loadError, true);
    return;
  }

  if (!dataReady) {
    drawStatusScreen("正在讀取 Google Sheets 題庫……", false);
    return;
  }

  if (!fontReady) {
    drawStatusScreen("正在載入字型……", false);
    return;
  }

  if (quizFinished) {
    drawResultScreen();
    return;
  }

  updateOptionAnimation();
  drawHeader();
  drawQuestion();
  drawOptions();
  drawNextButton();
}

function drawStatusScreen(message, isError) {
  noStroke();
  fill(isError ? "#8d0c0c" : "#263238");
  drawWrappedText(
    message,
    width / 2,
    height / 2,
    width - 40,
    30,
    width < 480 ? 20 : 24
  );
}

function drawHeader() {
  noStroke();
  fill("#263238");

  drawMixedText(
    "p5.js 程式設計簡易指令測驗",
    width / 2,
    42,
    width < 480 ? 24 : 30
  );

  fill("#607d8b");
  drawMixedText(
    `第 ${currentQuestion + 1} 題／共 ${questions.length} 題`,
    width / 2,
    76,
    width < 480 ? 16 : 18
  );
}

function drawQuestion() {
  const margin = width < 480 ? 16 : 24;
  const questionFontSize = width < 480 ? 20 : 24;

  fill("#ffffff");
  stroke("#d7ccc8");
  strokeWeight(2);
  rect(margin, 110, width - margin * 2, questionCardHeight, 18);

  noStroke();
  fill("#263238");
  drawWrappedText(
    questions[currentQuestion].question,
    width / 2,
    110 + questionCardHeight / 2,
    width - margin * 2 - 28,
    questionLineHeight,
    questionFontSize
  );

  if (answered) {
    const isCorrect =
      selectedOption === questions[currentQuestion].answer;
    const feedback = isCorrect
      ? "答對了！請按下一題繼續。"
      : "答錯了！綠色選項是正確答案。";

    fill(isCorrect ? "#354e0f" : "#8d0c0c");
    drawMixedText(
      feedback,
      width / 2,
      110 + questionCardHeight + 28,
      width < 480 ? 16 : 18
    );
  }
}

function drawOptions() {
  for (let index = 0; index < optionButtons.length; index++) {
    const button = optionButtons[index];
    const actualX = button.x + button.offsetX;
    const actualY = button.y + button.offsetY;

    let buttonColor = "#ffffff";
    let textColor = "#263238";

    if (answered) {
      if (index === questions[currentQuestion].answer) {
        buttonColor = "#354e0f";
        textColor = "#ffffff";
      }

      if (
        index === selectedOption &&
        selectedOption !== questions[currentQuestion].answer
      ) {
        buttonColor = "#8d0c0c";
        textColor = "#ffffff";
      }
    }

    fill(buttonColor);
    stroke("#b0bec5");
    strokeWeight(2);
    rect(actualX, actualY, button.width, button.height, 14);

    noStroke();
    fill(textColor);
    drawWrappedText(
      `${String.fromCharCode(65 + index)}. ${questions[currentQuestion].options[index]}`,
      actualX + button.width / 2,
      actualY + button.height / 2,
      button.width - 24,
      width < 480 ? 22 : 24,
      width < 480 ? 16 : 18
    );
  }
}

function updateOptionAnimation() {
  if (!answered) {
    return;
  }

  const correctAnswer = questions[currentQuestion].answer;

  for (let index = 0; index < optionButtons.length; index++) {
    const button = optionButtons[index];

    if (index === correctAnswer) {
      button.offsetY = sin(frameCount * 0.18) * 10;
      button.offsetX = 0;
    } else if (index === selectedOption) {
      button.offsetX = sin(frameCount * 0.24) * 14;
      button.offsetY = 0;
    } else {
      button.offsetX = 0;
      button.offsetY = 0;
    }
  }
}

function drawNextButton() {
  fill(answered ? "#1976d2" : "#b0bec5");
  stroke("#455a64");
  strokeWeight(2);
  rect(nextButton.x, nextButton.y, nextButton.width, nextButton.height, 14);

  noStroke();
  fill("#ffffff");
  drawMixedText(
    currentQuestion === questions.length - 1 ? "查看結果" : "下一題",
    width / 2,
    nextButton.y + nextButton.height / 2,
    width < 480 ? 18 : 20
  );
}

function drawResultScreen() {
  noStroke();
  fill("#263238");
  drawMixedText(
    "測驗完成！",
    width / 2,
    height * 0.24,
    width < 480 ? 28 : 36
  );

  fill("#354e0f");
  drawMixedText(
    `你答對了 ${score}／${questions.length} 題`,
    width / 2,
    height * 0.38,
    width < 480 ? 22 : 28
  );

  let message;
  if (score === questions.length) {
    message = "太棒了！你完全掌握 p5.js 基礎指令！";
  } else if (score >= 3) {
    message = "表現很好！繼續練習就會更熟悉。";
  } else {
    message = "再多練習幾次，你一定會進步！";
  }

  fill("#546e7a");
  drawWrappedText(
    message,
    width / 2,
    height * 0.5,
    width - 40,
    width < 480 ? 24 : 30,
    width < 480 ? 16 : 20
  );

  fill("#1976d2");
  stroke("#455a64");
  strokeWeight(2);
  rect(
    restartButton.x,
    restartButton.y,
    restartButton.width,
    restartButton.height,
    14
  );

  noStroke();
  fill("#ffffff");
  drawMixedText(
    "重新挑戰",
    width / 2,
    restartButton.y + restartButton.height / 2,
    width < 480 ? 18 : 20
  );
}

// ============================================================
// 滑鼠與觸控
// ============================================================
function mousePressed() {
  if (millis() - lastTouchTime < 500) {
    return false;
  }

  handlePointer(mouseX, mouseY, false);
  return false;
}

function touchStarted() {
  lastTouchTime = millis();

  if (touches.length > 0) {
    const point = touches[0];
    handlePointer(point.x, point.y, true);
  }

  return false;
}

function handlePointer(pointerX, pointerY, isTouch) {
  const now = millis();

  if (isTouch) {
    if (
      now - lastHandledTouchTime < 500 &&
      dist(pointerX, pointerY, lastHandledTouchX, lastHandledTouchY) < 20
    ) {
      return;
    }

    lastHandledTouchTime = now;
    lastHandledTouchX = pointerX;
    lastHandledTouchY = pointerY;
  }

  if (loadError !== "" || !dataReady || !fontReady) {
    return;
  }

  if (quizFinished) {
    if (isInsideButton(pointerX, pointerY, restartButton)) {
      startNewQuiz();
    }
    return;
  }

  if (!answered) {
    for (let index = 0; index < optionButtons.length; index++) {
      const button = optionButtons[index];
      const hitBox = {
        x: button.x + button.offsetX,
        y: button.y + button.offsetY,
        width: button.width,
        height: button.height
      };

      if (isInsideButton(pointerX, pointerY, hitBox)) {
        selectedOption = index;
        answered = true;

        if (selectedOption === questions[currentQuestion].answer) {
          score++;
        }
        break;
      }
    }
  }

  if (answered && isInsideButton(pointerX, pointerY, nextButton)) {
    goToNextQuestion();
  }
}

function isInsideButton(x, y, button) {
  if (!button) {
    return false;
  }

  return (
    x >= button.x &&
    x <= button.x + button.width &&
    y >= button.y &&
    y <= button.y + button.height
  );
}

function goToNextQuestion() {
  if (currentQuestion === questions.length - 1) {
    quizFinished = true;
    return;
  }

  currentQuestion++;
  answered = false;
  selectedOption = -1;
  createResponsiveLayout();
}

function windowResized() {
  resizeCanvas(
    max(320, windowWidth - 20),
    max(820, windowHeight - 20)
  );
  createResponsiveLayout();
}
