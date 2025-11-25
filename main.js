// إعداد الكانفاس
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// === تحميل الصور من مجلد الأصول ===
// تأكد من وضع صورة باسم background.png في مجلد assets/images/
const bgImg = new Image();
bgImg.src = "assets/images/background.png"; 

// إعدادات الشاشة
let GAME_WIDTH, GAME_HEIGHT;

function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.scale(dpr, dpr);
    GAME_WIDTH = window.innerWidth;
    GAME_HEIGHT = window.innerHeight;
    ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

// المتغيرات
let gameRunning = false;
let showControlsVisuals = true;
let score = { p: 0, e: 0 };
let player, enemy, bullets = [], particles = [];
let input = { active: false, ox: 0, oy: 0, cx: 0, cy: 0, touchId: null };

// شكل اللاعب (بيكسل)
const PIXEL_SCALE = 3;
const SPRITE = [
    [0,2,2,2,2,0], [2,2,2,2,2,2], [2,3,3,3,3,2],
    [2,2,2,2,2,2], [0,2,2,2,2,0], [0,1,0,0,1,0]
];

// === الوظائف الأساسية ===

function toggleControls() {
    showControlsVisuals = !showControlsVisuals;
    const btn = document.getElementById('toggle-controls');
    btn.innerText = showControlsVisuals ? '👁️' : '🚫';
    btn.style.opacity = showControlsVisuals ? '1' : '0.5';
}

function startGame() {
    document.getElementById('start-screen').style.display = 'none';
    player = { x: 100, y: GAME_HEIGHT/2, angle: 0, color: '#f1c40f', hp: 100 };
    enemy = { x: GAME_WIDTH-100, y: GAME_HEIGHT/2, angle: Math.PI, color: '#e74c3c', hp: 100 };
    gameRunning = true;
    loop();
}

function update() {
    // 1. حركة اللاعب
    if (input.active) {
        let dx = input.cx - input.ox;
        let dy = input.cy - input.oy;
        let ang = Math.atan2(dy, dx);
        let dist = Math.min(Math.sqrt(dx*dx+dy*dy), 60);
        let spd = (dist/60) * 6;
        player.x += Math.cos(ang) * spd;
        player.y += Math.sin(ang) * spd;
        player.angle = ang;
    }
    // حدود الشاشة
    player.x = Math.max(20, Math.min(GAME_WIDTH-20, player.x));
    player.y = Math.max(20, Math.min(GAME_HEIGHT-20, player.y));

    // 2. حركة العدو (AI)
    let ex = player.x - enemy.x;
    let ey = player.y - enemy.y;
    let edist = Math.sqrt(ex*ex + ey*ey);
    
    if(edist > 250) {
        enemy.x += (ex/edist) * 3;
        enemy.y += (ey/edist) * 3;
    } else if (edist < 150) {
        enemy.x -= (ex/edist) * 2.5;
        enemy.y -= (ey/edist) * 2.5;
    }
    enemy.angle = Math.atan2(ey, ex);
    
    if(Math.random() < 0.03) shoot(enemy);

    // 3. تحديث الرصاص (التعديل المطلوب هنا)
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += Math.cos(b.angle) * 12;
        b.y += Math.sin(b.angle) * 12;

        // حذف الرصاصة إذا خرجت من الشاشة
        if(b.x<0||b.x>GAME_WIDTH||b.y<0||b.y>GAME_HEIGHT) { 
            bullets.splice(i,1); 
            continue; 
        }

        let t = b.owner === 'p' ? enemy : player;
        
        // التحقق من التصادم
        if(Math.abs(b.x - t.x) < 30 && Math.abs(b.y - t.y) < 30) {
            
            // 1. إنشاء تأثير الطلاء
            createSplats(t.x, t.y, b.color);
            
            // 2. تحديث النتائج
            if(b.owner === 'p') {
                score.p++; document.getElementById('p-score').innerText = score.p;
                respawn(enemy);
            } else {
                score.e++; document.getElementById('e-score').innerText = score.e;
            }

            // 3. حذف الرصاصة فوراً (هذا ما طلبته)
            bullets.splice(i, 1); 
        }
    }
}

function draw() {
    // الخلفية
    if (bgImg.complete && bgImg.naturalWidth !== 0) {
        ctx.drawImage(bgImg, 0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(0,0, GAME_WIDTH, GAME_HEIGHT);
    } else {
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    // البقع
    for(let p of particles) {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    if(particles.length > 200) particles.shift();

    // العصا
    if(input.active && showControlsVisuals) {
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(input.ox, input.oy, 50, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke();
        ctx.beginPath(); ctx.arc(input.cx, input.cy, 20, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    }

    // الشخصيات
    drawSprite(player.x, player.y, player.color, player.angle);
    drawSprite(enemy.x, enemy.y, enemy.color, enemy.angle);

    // الرصاص
    for(let b of bullets) {
        ctx.fillStyle = b.color === player.color ? '#ffff00' : '#ff00ff';
        ctx.fillRect(b.x-4, b.y-4, 8, 8);
    }
}

function drawSprite(x, y, color, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    let s = PIXEL_SCALE;
    let offset = (SPRITE.length * s) / 2;
    for(let r=0; r<SPRITE.length; r++) {
        for(let c=0; c<SPRITE[0].length; c++) {
            let v = SPRITE[r][c];
            if(v!==0) {
                ctx.fillStyle = (v===2) ? color : (v===3 ? '#000' : '#f1c40f');
                ctx.fillRect((c*s)-offset, (r*s)-offset, s, s);
            }
        }
    }
    ctx.fillStyle = '#444';
    ctx.fillRect(offset, -s, s*4, s*2);
    ctx.restore();
}

function shoot(s) {
    bullets.push({
        x: s.x, y: s.y, angle: s.angle + (Math.random()-0.5)*0.1,
        color: s.color, owner: s === player ? 'p' : 'e'
    });
}

function createSplats(x, y, c) {
    for(let i=0; i<12; i++) {
        particles.push({
            x: x + (Math.random()-0.5)*40,
            y: y + (Math.random()-0.5)*40,
            color: c, size: (Math.random()*4 + 2)
        });
    }
}

function respawn(c) {
    c.x = Math.random()*(GAME_WIDTH-100)+50;
    c.y = Math.random()*(GAME_HEIGHT-100)+50;
}

function loop() {
    if(gameRunning) { update(); draw(); requestAnimationFrame(loop); }
}

// التحكم باللمس
window.addEventListener('touchstart', e => {
    e.preventDefault();
    for(let i=0; i<e.changedTouches.length; i++) {
        let t = e.changedTouches[i];
        if(t.clientX < GAME_WIDTH/2) {
            input.active = true; input.touchId = t.identifier;
            input.ox = input.cx = t.clientX; input.oy = input.cy = t.clientY;
        } else if(gameRunning) shoot(player);
    }
}, {passive:false});

window.addEventListener('touchmove', e => {
    e.preventDefault();
    for(let i=0; i<e.changedTouches.length; i++) {
        let t = e.changedTouches[i];
        if(input.active && t.identifier === input.touchId) {
            input.cx = t.clientX; input.cy = t.clientY;
        }
    }
}, {passive:false});

window.addEventListener('touchend', e => {
    e.preventDefault();
    for(let i=0; i<e.changedTouches.length; i++) {
        if(e.changedTouches[i].identifier === input.touchId) input.active = false;
    }
}, {passive:false});
