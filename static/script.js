// script.js

let prodChart; // 存储图表实例的全局变量 / Store Chart instance globally
// Use the local loopback address by default so only this machine can access the backend.
const API_ENDPOINT = 'http://127.0.0.1:8080/api/data';

// --- [System Clock / 系统时钟] ---
const startClock = () => {
    setInterval(() => {
        const now = new Date(); // 获取当前时间 / Get current time
        const pad = (n) => String(n).padStart(2, '0'); // 补零逻辑 (如 9->09) / Zero padding
        
        // 更新时间文字 / Update time text
        const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        document.getElementById("current-time").innerText = timeStr;
        // 更新日期文字 / Update date text
        document.getElementById("current-date").innerText = now.toLocaleDateString();
    }, 1000); // 1秒执行一次 / Run every 1 second
};

// --- [Chart Integration / 图表初始化] ---
const initChart = () => {
    const ctx = document.getElementById('productionChart').getContext('2d'); // 获取画布 / Get canvas context
    prodChart = new Chart(ctx, { // 实例化图表 / Instantiate Chart.js
        type: 'line', // 折线图 / Line chart
        data: {
            labels: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'], // 初始横坐标 / Initial labels
            datasets: [{
                label: 'Production Units', // 数据标签 / Dataset label
                data: [0, 0, 0, 0, 0, 0], // 初始数据 / Initial data
                borderColor: '#2e5bff', // 线条颜色 / Line color
                backgroundColor: 'rgba(46, 91, 255, 0.1)', // 填充颜色 / Fill color
                fill: true, // 开启填充 / Enable fill
                tension: 0.4 // 曲线平滑度 / Spline tension
            }]
        },
        options: {
            responsive: true, // 响应式 / Responsive
            maintainAspectRatio: false, // 不强制比例 / No fixed ratio
            scales: {
                y: { beginAtZero: true, grid: { color: '#1f2229' } }, // Y轴从0开始 / Y-axis from 0
                x: { grid: { display: false } } // X轴隐藏网格 / Disable X-grid
            },
            plugins: { legend: { display: false } } // 隐藏图例 / Hide legend
        }
    });
};

// --- [Backend Sync / 后端同步] ---
const syncWithBackend = async () => {
    try {
        // Fetch from configured endpoint (same origin by default)
        const response = await fetch(API_ENDPOINT);
        const data = await response.json(); // 解析为 JSON / Parse JSON

        // 1. Update Stats / 更新数值
        document.getElementById("temp").innerText = data.temperature;
        document.getElementById("energy").innerText = data.energy;
        
        // 2. Update Status Text / 更新状态文字
        const statusLabel = document.getElementById("status");
        statusLabel.innerText = data.status_text;

        // 3. State-driven Colors / 状态驱动变色
        if (data.status_code === "error") {
            statusLabel.style.color = "#ff4b5c"; // 报错红 / Red
        } else if (data.status_code === "warning") {
            statusLabel.style.color = "#f9ca24"; // 警告黄 / Yellow
        } else {
            statusLabel.style.color = "#00e676"; // 正常绿 / Green
        }

        // 4. Update Chart / 更新图表
        if (prodChart) {
            prodChart.data.datasets[0].data.shift(); // 移除最旧数据 / Remove old data
            prodChart.data.datasets[0].data.push(data.production / 100); // 加入新数据 / Push new data
            prodChart.update(); // 重画图表 / Redraw
        }

    } catch (error) { // 捕获错误 / Catch errors
        console.error("Backend link failed / 后端连接失败", error);
        // Update UI to reflect backend connectivity issue
        const backendStatus = document.getElementById('backend-status');
        if (backendStatus) {
            backendStatus.innerText = 'Backend Disconnected';
        }
        const statusLabel = document.getElementById("status");
        if (statusLabel) {
            statusLabel.innerText = 'OFFLINE';
            statusLabel.style.color = '#888d9b';
        }
    }
};

// --- [View Switcher / 视图切换] ---
const initViewSwitcher = () => {
    const navItems = document.querySelectorAll('.nav-item'); // 获取导航项 / Get nav items
    const views = document.querySelectorAll('.view-content'); // 获取页面区块 / Get view blocks
    const title = document.getElementById('view-title'); // 获取标题槽 / Get title slot

    navItems.forEach(item => {
        item.addEventListener('click', (e) => { // 点击监听 / Click listener
            e.preventDefault(); // 阻止默认行为 / Prevent default
            const target = item.getAttribute('data-target'); // 获取目标ID / Get target ID

            // 切换导航和页面的 active 类 / Toggle active class
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            views.forEach(v => v.classList.remove('active'));
            document.getElementById(target).classList.add('active');

            // 同步顶部标题 / Update header title
            title.innerText = item.innerText.trim() + " Overview";
        });
    });
};

// --- [Global Initialization / 系统总启动] ---
document.addEventListener("DOMContentLoaded", () => {
    startClock(); // 开启时钟
    initChart(); // 开启图表
    initViewSwitcher(); // 开启导航
    syncWithBackend(); // 立即同步一次
    setInterval(syncWithBackend, 3000); // 3秒同步一次 / Sync every 3s
});