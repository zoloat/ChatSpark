// Display Page - ParticleEngine ベース

const canvas = document.getElementById('particleCanvas');
const pEngine = new ParticleEngine(canvas);

let imageIndex = {};

fetch('/api/image-index')
  .then(r => r.json())
  .then(idx => { imageIndex = idx; })
  .catch(() => {});

const imageResolver = (name) => {
  const baseName = name.replace(/\.\w+$/, '');
  if (imageIndex[baseName] && imageIndex[baseName].length > 1) {
    const files = imageIndex[baseName];
    const picked = files[Math.floor(Math.random() * files.length)];
    return `/assets/${picked}`;
  }
  return `/assets/${name}`;
};

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  pEngine.resizeCanvas();
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Socket.io
const socket = io();

socket.on('connect', () => console.log('Display connected'));

socket.on('triggerMatched', (data) => {
  if (data.effectConfig) {
    pEngine.play(data.effectConfig, imageResolver);
  }
});

// 設定パネルからのプレビュー
window.addEventListener('message', (event) => {
  if (event.data?.effectConfig) {
    pEngine.clear();
    pEngine.play(event.data.effectConfig, imageResolver);
  }
});
