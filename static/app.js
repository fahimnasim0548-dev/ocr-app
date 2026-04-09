let images = [];
let currentIndex = -1;

let currentLayout = localStorage.getItem("ocr_layout") || "horizontal";

let zoomValue = 1;
let brightnessValue = 100;
let contrastValue = 100;
let textSizeValue = 16;

let panX = 0;
let panY = 0;

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragOriginX = 0;
let dragOriginY = 0;

let drawMode = false;
let boxMode = false;
let isDrawing = false;
let currentStroke = null;
let startBoxX = 0;
let startBoxY = 0;

const fileInput = document.getElementById("fileInput");
const previewImage = document.getElementById("previewImage");
const drawCanvas = document.getElementById("drawCanvas");
const imageWrapper = document.getElementById("imageWrapper");
const ocrText = document.getElementById("ocrText");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const downloadBtn = document.getElementById("downloadBtn");
const resetViewBtn = document.getElementById("resetViewBtn");
const layoutToggleBtn = document.getElementById("layoutToggleBtn");
const drawToggleBtn = document.getElementById("drawToggleBtn");
const boxModeBtn = document.getElementById("boxModeBtn");
const undoBtn = document.getElementById("undoBtn");
const clearDrawBtn = document.getElementById("clearDrawBtn");
const statusText = document.getElementById("statusText");
const mainContainer = document.querySelector(".main");

const zoomSlider = document.getElementById("zoomSlider");
const brightnessSlider = document.getElementById("brightnessSlider");
const contrastSlider = document.getElementById("contrastSlider");
const textSizeSlider = document.getElementById("textSizeSlider");

const ctx = drawCanvas.getContext("2d");

fileInput.addEventListener("change", (e) => {
  images = Array.from(e.target.files).map(file => ({
    file,
    name: file.name,
    url: URL.createObjectURL(file),
    ocrText: "",
    editedText: "",
    ocrDone: false,
    isDirty: false,
    drawings: []
  }));

  if (images.length > 0) {
    loadImage(0);
  }
});

ocrText.addEventListener("input", () => {
  if (currentIndex >= 0) {
    images[currentIndex].editedText = ocrText.value;
    images[currentIndex].isDirty = true;
  }
});

prevBtn.addEventListener("click", async () => {
  if (currentIndex > 0) {
    await autoSaveCurrent();
    await loadImage(currentIndex - 1);
  }
});

nextBtn.addEventListener("click", async () => {
  if (currentIndex < images.length - 1) {
    await autoSaveCurrent();
    await loadImage(currentIndex + 1);
  }
});

downloadBtn.addEventListener("click", async () => {
  if (currentIndex < 0) return;

  await autoSaveCurrent();

  const image = images[currentIndex];
  const txtName = image.name.replace(/\.[^/.]+$/, "") + ".txt";
  window.location.href = "/download/" + encodeURIComponent(txtName);
});

resetViewBtn.addEventListener("click", () => {
  resetImageView();
  applyImageStyles();
  setStatus("View reset");
});

layoutToggleBtn.addEventListener("click", () => {
  currentLayout = currentLayout === "horizontal" ? "vertical" : "horizontal";
  applyLayout();
  setStatus(`Layout changed to ${capitalize(currentLayout)}`);
});

drawToggleBtn.addEventListener("click", () => {
  drawMode = !drawMode;
  if (drawMode) boxMode = false;
  updateDrawButtons();
});

boxModeBtn.addEventListener("click", () => {
  boxMode = !boxMode;
  if (boxMode) drawMode = false;
  updateDrawButtons();
});

undoBtn.addEventListener("click", () => {
  if (currentIndex < 0) return;
  const drawings = images[currentIndex].drawings;
  if (drawings.length > 0) {
    drawings.pop();
    redrawCanvas();
    setStatus("Last annotation removed");
  }
});

clearDrawBtn.addEventListener("click", () => {
  if (currentIndex < 0) return;
  images[currentIndex].drawings = [];
  redrawCanvas();
  setStatus("Annotations cleared");
});

zoomSlider.addEventListener("input", () => {
  zoomValue = Number(zoomSlider.value) / 100;
  applyImageStyles();
});

brightnessSlider.addEventListener("input", () => {
  brightnessValue = Number(brightnessSlider.value);
  applyImageStyles();
});

contrastSlider.addEventListener("input", () => {
  contrastValue = Number(contrastSlider.value);
  applyImageStyles();
});

textSizeSlider.addEventListener("input", () => {
  textSizeValue = Number(textSizeSlider.value);
  ocrText.style.fontSize = `${textSizeValue}px`;
});

imageWrapper.addEventListener("mousedown", (e) => {
  if (!previewImage.src) return;

  if (drawMode || boxMode) {
    startDrawing(e);
    return;
  }

  isDragging = true;
  imageWrapper.classList.add("dragging");
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragOriginX = panX;
  dragOriginY = panY;
});

window.addEventListener("mousemove", (e) => {
  if (isDrawing) {
    continueDrawing(e);
    return;
  }

  if (!isDragging) return;

  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;

  panX = dragOriginX + dx;
  panY = dragOriginY + dy;

  applyImageStyles();
});

window.addEventListener("mouseup", () => {
  if (isDrawing) {
    finishDrawing();
  }

  isDragging = false;
  imageWrapper.classList.remove("dragging");
});

imageWrapper.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (!previewImage.src) return;

  const rect = imageWrapper.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const oldZoom = zoomValue;
  const zoomStep = e.deltaY < 0 ? 1.1 : 0.9;
  let newZoom = oldZoom * zoomStep;

  newZoom = Math.max(0.2, Math.min(newZoom, 4));

  panX = mouseX - ((mouseX - panX) * (newZoom / oldZoom));
  panY = mouseY - ((mouseY - panY) * (newZoom / oldZoom));

  zoomValue = newZoom;
  zoomSlider.value = Math.round(zoomValue * 100);

  applyImageStyles();
}, { passive: false });

previewImage.addEventListener("load", () => {
  syncCanvasToImage();
  resetImageView();
  applyImageStyles();
  redrawCanvas();
});

function setStatus(message) {
  statusText.textContent = message;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function applyLayout() {
  mainContainer.classList.remove("horizontal", "vertical");
  mainContainer.classList.add(currentLayout);

  layoutToggleBtn.textContent =
    currentLayout === "horizontal"
      ? "Layout: Horizontal"
      : "Layout: Vertical";

  localStorage.setItem("ocr_layout", currentLayout);
}

function updateDrawButtons() {
  drawToggleBtn.textContent = `Draw Mode: ${drawMode ? "On" : "Off"}`;
  boxModeBtn.textContent = `Box Mode: ${boxMode ? "On" : "Off"}`;
  drawCanvas.style.pointerEvents = (drawMode || boxMode) ? "auto" : "none";
  imageWrapper.style.cursor = (drawMode || boxMode) ? "crosshair" : "grab";
}

function syncCanvasToImage() {
  drawCanvas.width = previewImage.naturalWidth || previewImage.width || 1;
  drawCanvas.height = previewImage.naturalHeight || previewImage.height || 1;

  drawCanvas.style.width = `${previewImage.naturalWidth || previewImage.width}px`;
  drawCanvas.style.height = `${previewImage.naturalHeight || previewImage.height}px`;
}

function resetImageView() {
  zoomValue = 1;
  panX = 0;
  panY = 0;
  zoomSlider.value = 100;
}

function applyImageStyles() {
  const transform = `translate(${panX}px, ${panY}px) scale(${zoomValue})`;

  previewImage.style.transform = transform;
  drawCanvas.style.transform = transform;

  previewImage.style.filter = `brightness(${brightnessValue}%) contrast(${contrastValue}%)`;
}

function getCanvasPoint(e) {
  const rect = imageWrapper.getBoundingClientRect();
  const x = (e.clientX - rect.left - panX) / zoomValue;
  const y = (e.clientY - rect.top - panY) / zoomValue;
  return { x, y };
}

function startDrawing(e) {
  if (currentIndex < 0) return;
  isDrawing = true;

  const p = getCanvasPoint(e);

  if (drawMode) {
    currentStroke = {
      type: "freehand",
      points: [p]
    };
  }

  if (boxMode) {
    startBoxX = p.x;
    startBoxY = p.y;
    currentStroke = {
      type: "box",
      x: p.x,
      y: p.y,
      w: 0,
      h: 0
    };
  }
}

function continueDrawing(e) {
  if (!currentStroke) return;

  const p = getCanvasPoint(e);

  if (currentStroke.type === "freehand") {
    currentStroke.points.push(p);
  } else if (currentStroke.type === "box") {
    currentStroke.w = p.x - startBoxX;
    currentStroke.h = p.y - startBoxY;
  }

  redrawCanvas(currentStroke);
}

function finishDrawing() {
  if (!isDrawing || !currentStroke || currentIndex < 0) {
    isDrawing = false;
    currentStroke = null;
    return;
  }

  images[currentIndex].drawings.push(currentStroke);
  isDrawing = false;
  currentStroke = null;
  redrawCanvas();
  setStatus("Annotation added");
}

function redrawCanvas(tempShape = null) {
  ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  if (currentIndex < 0) return;

  const items = [...images[currentIndex].drawings];
  if (tempShape) items.push(tempShape);

  for (const item of items) {
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#ef4444";

    if (item.type === "freehand") {
      if (item.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(item.points[0].x, item.points[0].y);
      for (let i = 1; i < item.points.length; i++) {
        ctx.lineTo(item.points[i].x, item.points[i].y);
      }
      ctx.stroke();
    }

    if (item.type === "box") {
      ctx.strokeRect(item.x, item.y, item.w, item.h);
    }
  }
}

async function loadImage(index) {
  currentIndex = index;
  const image = images[index];

  previewImage.src = image.url;
  setStatus(`Image ${index + 1} / ${images.length}`);

  if (image.ocrDone) {
    ocrText.value = image.editedText || image.ocrText;
    ocrText.style.fontSize = `${textSizeValue}px`;
    setTimeout(() => redrawCanvas(), 0);
    return;
  }

  ocrText.value = "Running OCR...";
  ocrText.style.fontSize = `${textSizeValue}px`;
  setStatus(`Running OCR for ${image.name}...`);

  const formData = new FormData();
  formData.append("image", image.file);

  const response = await fetch("/run-ocr", {
    method: "POST",
    body: formData
  });

  const data = await response.json();

  image.ocrText = data.text || "";
  image.editedText = data.text || "";
  image.ocrDone = true;
  image.isDirty = false;

  ocrText.value = image.editedText;
  setStatus(`Loaded ${image.name}`);
  setTimeout(() => redrawCanvas(), 0);
}

async function autoSaveCurrent() {
  if (currentIndex < 0) return;

  const image = images[currentIndex];
  if (!image.isDirty) return;

  const response = await fetch("/save-text", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      image_name: image.name,
      text: image.editedText || image.ocrText
    })
  });

  const data = await response.json();

  if (data.success) {
    image.isDirty = false;
    setStatus(`Saved ${data.file}`);
  } else {
    alert("Auto-save failed");
  }
}

updateDrawButtons();
applyLayout();
