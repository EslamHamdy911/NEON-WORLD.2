
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// === إعدادات الموسيقى (اختياري) ===
const bgMusic = new Audio('music.mp3'); 
bgMusic.loop = true; 
bgMusic.volume = 0.4;

let width, height;
function resize() {
    width = window.innerWidth; 
    height = window.innerHeight;
    canvas.width = width; 
    canvas.height = height;
}
window.addEventListener('resize', resize); 
resize();

// === حالة اللعبة ===
let gameState = 'START'; // START, PLAY, UPGRADE, OVER
let frame = 0;
let score = 0;
let kills = 0;

// === اللاعب والترقيات ===
const player = {
    x: 0, y: 0, radius: 15, angle: 0,
    hp: 100, maxHp: 100,
    speed: 4,
    level: 1, xp: 0, nextLevelXp: 50,
    // خصائص السلاح
    bulletDmg: 20,
    bulletSpeed: 12,
    fireRate: 20, 
    bulletCount: 1, 
    spread: 0.1,
    pierce: 0 
};

// مصفوفات الكائنات
let enemies = [];
let bullets = [];
let particles = [];
let xpOrbs = [];
let damageTexts = [];
let shake = 0;

// === المدخلات ===
const input = {
    active: false,
    sx: 0, sy: 0, 
    cx: 0, cy: 0, 
    dx: 0, dy: 0, 
    id: null
};

// ========================
// نظام الترقيات (ROGUELIKE)
// ========================
const upgradesList = [
    { id: 'multishot', name: 'DOUBLE BARREL', desc: '+1 Bullet per shot', icon: '🔫', apply: () => { player.bulletCount++; player.spread += 0.1; } },
    { id: 'dmg', name: 'HIGH VOLTAGE', desc: '+25% Damage', icon: '⚡', apply: () => { player.bulletDmg = Math.floor(player.bulletDmg * 1.25); } },
    { id: 'speed', name: 'OVERCLOCK', desc: '+15% Fire Rate', icon: '🔥', apply: () => { player.fireRate = Math.max(5, Math.floor(player.fireRate * 0.85)); } },
    { id: 'heal', name: 'REPAIR BOT', desc: 'Recover 50% HP', icon: '❤️', apply: () => { player.hp = Math.min(player.maxHp, player.hp + (player.maxHp*0.5)); } },
    { id: 'move', name: 'THRUSTERS', desc: '+10% Move Speed', icon: '🚀', apply: () => { player.speed *= 1.1; } },
    { id: 'pierce', name: 'RAILGUN', desc: 'Bullets pierce 1 enemy', icon: '🏹', apply: () => { player.pierce++; } }
];

function showUpgradeScreen() {
    gameState = 'UPGRADE';
    const box = document.getElementById('cards-box');
    box.innerHTML = '';
    
    // اختيار 3 ترقيات عشوائية
    for(let i=0; i<3; i++) {
        const upg = upgradesList[Math.floor(Math.random() * upgradesList.length)];
        const div = document.createElement('div');
        div.className = 'upgrade-card';
        div.innerHTML = `<div class="icon">${upg.icon}</div><div class="desc"><h3>${upg.name}</h3><span>${upg.desc}</span></div>`;
        div.onclick = () => {
            upg.apply();
            document.getElementById('upgrade-screen').style.display = 'none';
            gameState = 'PLAY';
            createFloatingText(player.x, player.y - 30, "SYSTEM UPGRADED", '#0f0', 20);
        };
        box.appendChild(div);
    }
    document.getElementById('upgrade-screen').style.display = 'flex';
}

// ========================
// الكلاسات (Classes)
// ========================
class Enemy {
    constructor(type) {
        this.type = type; // 0:Chaser, 1:Tank, 2:Shooter
        let angle = Math.random() * Math.PI * 2;
        let dist = Math.max(width, height) * 0.8;
        this.x = player.x + Math.cos(angle) * dist;
        this.y = player.y + Math.sin(angle) * dist;
        
        if(type === 0) { // Chaser
            this.hp = 30 + (player.level * 5);
            this.speed = 3 + (Math.random());
            this.radius = 12;
            this.color = '#ff0055';
            this.xp = 10;
        } else if (type === 1) { // Tank
            this.hp = 100 + (player.level * 15);
            this.speed = 1.5;
            this.radius = 25;
            this.color = '#ffaa00';
            this.xp = 30;
        } else { // Shooter
            this.hp = 40 + (player.level * 8);
            this.speed = 2;
            this.radius = 15;
            this.color = '#aa00ff';
            this.xp = 20;
            this.shootTimer = 0;
        }
    }

    update() {
        let dx = player.x - this.x;
        let dy = player.y - this.y;
        let dist = Math.hypot(dx, dy);
        let angle = Math.atan2(dy, dx);

        if(this.type === 2) { // Shooter Logic
            if(dist > 250) {
                this.x += Math.cos(angle) * this.speed;
                this.y += Math.sin(angle) * this.speed;
            } else if (dist < 150) {
                this.x -= Math.cos(angle) * this.speed;
                this.y -= Math.sin(angle) * this.speed;
            }
            this.shootTimer++;
            if(this.shootTimer > 100) {
                this.shootTimer = 0;
                bullets.push({
                    x: this.x, y: this.y, 
                    vx: Math.cos(angle)*6, vy: Math.sin(angle)*6, 
                    color: '#aa00ff', owner: 'enemy', dmg: 10, radius: 4, life: 100
                });
            }
        } else { // Melee Logic
            this.x += Math.cos(angle) * this.speed;
            this.y += Math.sin(angle) * this.speed;
            if(dist < this.radius + player.radius) {
                player.hp -= 0.5;
                createParticles(this.x, this.y, '#f00', 1);
                shake = 5;
            }
        }
    }

    draw() {
        ctx.save(); ctx.translate(this.x, this.y);
        ctx.fillStyle = this.color; ctx.shadowBlur = 10; ctx.shadowColor = this.color;
        
        if(this.type === 1) ctx.fillRect(-this.radius, -this.radius, this.radius*2, this.radius*2); 
        else if (this.type === 2) { 
            ctx.rotate(Math.atan2(player.y - this.y, player.x - this.x));
            ctx.beginPath(); ctx.moveTo(15,0); ctx.lineTo(-10, 10); ctx.lineTo(-10, -10); ctx.fill();
        } else { 
            ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    }
}

class XpOrb {
    constructor(x, y, amount) {
        this.x = x; this.y = y; this.amount = amount;
        this.magnet = false;
    }
    update() {
        let dx = player.x - this.x; let dy = player.y - this.y;
        let dist = Math.hypot(dx, dy);
        if(dist < 150) this.magnet = true;
        
        if(this.magnet) {
            this.x += (dx/dist) * 12;
            this.y += (dy/dist) * 12;
            if(dist < player.radius + 10) {
                addXp(this.amount);
                return true; 
            }
        }
        return false;
    }
    draw() {
        ctx.fillStyle = '#00ff00'; ctx.shadowBlur = 5; ctx.shadowColor = '#00ff00';
        ctx.beginPath(); ctx.arc(this.x, this.y, 4, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
    }
}

class FloatingText {
    constructor(x, y, text, color, size) {
        this.x = x; this.y = y; this.text = text; this.color = color; this.size = size;
        this.life = 60; this.vy = -1;
    }
    update() {
        this.y += this.vy; this.life--;
        return this.life <= 0;
    }
    draw() {
        ctx.globalAlpha = this.life / 60;
        ctx.fillStyle = this.color; ctx.font = `bold ${this.size}px monospace`;
        ctx.fillText(this.text, this.x, this.y);
        ctx.globalAlpha = 1;
    }
}

// ========================
// الوظائف المساعدة
// ========================

function createParticles(x, y, color, count) {
    for(let i=0; i<count; i++) particles.push({x, y, vx:(Math.random()-0.5)*10, vy:(Math.random()-0.5)*10, life:1, color});
}

function createFloatingText(x, y, text, color, size=14) {
    damageTexts.push(new FloatingText(x + (Math.random()*20-10), y, text, color, size));
}

function addXp(amount) {
    player.xp += amount;
    if(player.xp >= player.nextLevelXp) {
        player.xp -= player.nextLevelXp;
        player.level++;
        player.nextLevelXp = Math.floor(player.nextLevelXp * 1.5);
        document.getElementById('lvl-txt').innerText = player.level;
        showUpgradeScreen();
    }
    updateUi();
}

function updateUi() {
    let xpPerc = (player.xp / player.nextLevelXp) * 100;
    document.getElementById('xp-fill').style.width = xpPerc + "%";
    let hpPerc = (player.hp / player.maxHp) * 100;
    document.getElementById('hp-fill').style.width = hpPerc + "%";
    document.getElementById('kill-count').innerText = kills;
}

function applyShake() {
    if(shake > 0) {
        ctx.translate((Math.random()-0.5)*shake, (Math.random()-0.5)*shake);
        shake *= 0.9;
    }
}

// ========================
// الحلقة الرئيسية (Main Loop)
// ========================

function startGame() {
    document.getElementById('start-screen').style.display = 'none';
    player.x = width/2; player.y = height/2;
    player.hp = 100; player.level = 1; player.xp = 0;
    enemies = []; bullets = []; xpOrbs = [];
    bgMusic.play().catch(()=>{});
    gameState = 'PLAY';
    loop();
}

function loop() {
    requestAnimationFrame(loop);
    if(gameState !== 'PLAY') return;
    frame++;

    ctx.fillStyle = 'rgba(5, 5, 5, 0.3)'; 
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    applyShake();

    // 1. Spawner
    let maxEnemies = 5 + player.level * 2;
    if(enemies.length < maxEnemies) {
        let type = 0; 
        if(player.level > 2 && Math.random() < 0.2) type = 2; // Shooter
        if(player.level > 4 && Math.random() < 0.1) type = 1; // Tank
        enemies.push(new Enemy(type));
    }

    // 2. Player
    if(input.active) {
        player.x += input.dx * player.speed;
        player.y += input.dy * player.speed;
        player.x = Math.max(20, Math.min(width-20, player.x));
        player.y = Math.max(20, Math.min(height-20, player.y));

        if(frame % player.fireRate === 0) {
            let nearest = null, minDist = 9999;
            enemies.forEach(e => {
                let d = Math.hypot(e.x - player.x, e.y - player.y);
                if(d < minDist) { minDist = d; nearest = e; }
            });
            
            let targetAngle = input.dy || input.dx ? Math.atan2(input.dy, input.dx) : 0;
            if(nearest && minDist < 400) targetAngle = Math.atan2(nearest.y - player.y, nearest.x - player.x);

            for(let i=0; i<player.bulletCount; i++) {
                let offset = (i - (player.bulletCount-1)/2) * player.spread;
                bullets.push({
                    x: player.x, y: player.y, 
                    vx: Math.cos(targetAngle+offset)*player.bulletSpeed, vy: Math.sin(targetAngle+offset)*player.bulletSpeed, 
                    color: '#00f3ff', owner: 'player', dmg: player.bulletDmg, radius: 4, life: 100, pierce: player.pierce
                });
            }
        }
    }

    // Draw Player
    ctx.shadowBlur = 15; ctx.shadowColor = '#00f3ff'; ctx.fillStyle = '#00f3ff';
    ctx.beginPath(); ctx.arc(player.x, player.y, player.radius, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;

    // 3. Updates
    xpOrbs = xpOrbs.filter(o => { o.draw(); return !o.update(); });
    damageTexts = damageTexts.filter(t => { t.draw(); return !t.update(); });

    for(let i=particles.length-1; i>=0; i--) {
        let p = particles[i]; p.x += p.vx; p.y += p.vy; p.life -= 0.05;
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color; 
        ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1; if(p.life<=0) particles.splice(i,1);
    }

    enemies.forEach((e, ei) => { e.update(); e.draw(); });

    for(let i=bullets.length-1; i>=0; i--) {
        let b = bullets[i]; 
        b.x += b.vx; b.y += b.vy; b.life--;
        
        ctx.fillStyle = b.color; ctx.shadowBlur = 5; ctx.shadowColor = b.color;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;

        if(b.x<0||b.x>width||b.y<0||b.y>height||b.life<=0) { bullets.splice(i,1); continue; }

        if(b.owner === 'player') {
            for(let j=enemies.length-1; j>=0; j--) {
                let e = enemies[j];
                if(Math.hypot(b.x-e.x, b.y-e.y) < b.radius + e.radius) {
                    e.hp -= b.dmg;
                    createFloatingText(e.x, e.y, b.dmg, '#fff'); 
                    createParticles(e.x, e.y, b.color, 3);
                    if(e.hp <= 0) {
                        xpOrbs.push(new XpOrb(e.x, e.y, e.xp));
                        createParticles(e.x, e.y, e.color, 10);
                        enemies.splice(j, 1);
                        kills++; shake = 5;
                    }
                    if(b.pierce > 0) { b.pierce--; } else { bullets.splice(i,1); }
                    break;
                }
            }
        } else { 
            if(Math.hypot(b.x-player.x, b.y-player.y) < b.radius + player.radius) {
                player.hp -= b.dmg;
                createFloatingText(player.x, player.y, "-"+b.dmg, '#f00', 18);
                shake = 10;
                createParticles(player.x, player.y, '#f00', 5);
                bullets.splice(i,1);
            }
        }
    }

    updateUi();
    if(player.hp <= 0) {
        gameState = 'OVER';
        document.getElementById('final-score').innerText = kills;
        document.getElementById('final-level').innerText = player.level;
        document.getElementById('game-over-screen').style.display = 'flex';
    }

    // Joystick Draw
    if(input.active) {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(input.sx, input.sy, 50, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = 'rgba(0, 243, 255, 0.5)';
        ctx.beginPath(); ctx.arc(input.cx, input.cy, 20, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
}

// === التحكم باللمس ===
window.addEventListener('touchstart', e => {
    if(e.target.tagName === 'BUTTON' || e.target.closest('.upgrade-card')) return;
    e.preventDefault();
    if(!input.active && gameState === 'PLAY') {
        let t = e.changedTouches[0];
        input.active = true; input.id = t.identifier;
        input.sx = t.clientX; input.sy = t.clientY;
        input.cx = t.clientX; input.cy = t.clientY;
    }
}, {passive: false});

window.addEventListener('touchmove', e => {
    if(gameState !== 'PLAY') return;
    e.preventDefault();
    for(let i=0; i<e.changedTouches.length; i++) {
        if(e.changedTouches[i].identifier === input.id) {
            let t = e.changedTouches[i];
            let dx = t.clientX - input.sx; let dy = t.clientY - input.sy;
            let dist = Math.min(50, Math.hypot(dx, dy));
            let angle = Math.atan2(dy, dx);
            input.cx = input.sx + Math.cos(angle) * dist;
            input.cy = input.sy + Math.sin(angle) * dist;
            input.dx = Math.cos(angle) * (dist/50);
            input.dy = Math.sin(angle) * (dist/50);
        }
    }
}, {passive: false});

window.addEventListener('touchend', e => {
    for(let i=0; i<e.changedTouches.length; i++) {
        if(e.changedTouches[i].identifier === input.id) {
            input.active = false; input.dx = 0; input.dy = 0;
        }
    }
});
