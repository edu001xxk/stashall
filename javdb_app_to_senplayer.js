let url = $request.url || "";
let body = $response.body;

if (!body) {
    $done({});
}

// ==========================================
// 1. 过滤非详情页 (解决刚打开APP就弹窗)
// ==========================================
// 如果请求路径中包含首页、列表、排行、搜索等特征，直接放行并停止执行脚本
if (url.match(/\/(home|index|list|rank|search|actors|makers|popular|trending)/i)) {
    $done({ body });
    // 注意：JS 环境下必须 return 才能阻断后续代码执行
    return; 
}

// ==========================================
// 2. 匹配标准番号
// ==========================================
let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
let match = body.match(idReg);

if (!match || !match[1]) {
    $done({ body });
    return;
}

let code = match[1].toLowerCase();

// ==========================================
// 3. 时间戳防并发锁 (解决瞬间弹窗两次)
// ==========================================
let cacheKey = "javdb_lock_" + code;
let now = Date.now();
let lastTime = 0;

// 兼容不同代理工具的本地存储
if (typeof $persistentStore !== "undefined") {
    lastTime = parseInt($persistentStore.read(cacheKey) || "0");
} else if (typeof $prefs !== "undefined") {
    lastTime = parseInt($prefs.valueForKey(cacheKey) || "0");
}

// 如果距离上次解析同一个番号的时间小于 10 秒 (10000毫秒)，说明是同一页面的并发请求，直接跳过
if (now - lastTime < 10000) {
    console.log(`\n[JavDB-SenPlayer] ♻️ 10秒内重复请求 ${code.toUpperCase()}，已拦截防抖。`);
    $done({ body });
    return;
}

// 写入当前时间戳，锁定 10 秒
if (typeof $persistentStore !== "undefined") {
    $persistentStore.write(now.toString(), cacheKey);
} else if (typeof $prefs !== "undefined") {
    $prefs.setValueForKey(now.toString(), cacheKey);
}

console.log(`\n[JavDB-SenPlayer] 🔍 开始搜索番号: ${code.toUpperCase()}`);
runJableSearch(code);


// ==========================================
// 独立函数 1：请求 Jable 原番号
// ==========================================
function runJableSearch(code) {
    let jableUrl = `https://jable.tv/videos/${code}/`;
    $httpClient.get({
        url: jableUrl,
        headers: getFakeHeaders()
    }, function(error, response, data) {
        let foundM3u8 = false;
        
        if (!error && response && response.status === 200) {
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
            let m3u8Match = data ? data.match(m3u8Reg) : null;
            if (m3u8Match) {
                foundM3u8 = true;
                handleSuccess(code, m3u8Match[0], "Jable");
            }
        }
        
        if (!foundM3u8) {
            console.log(`[JavDB-SenPlayer] ⚠️ Jable 原番号未找到，尝试带 -c 后缀...`);
            runJableCSearch(code);
        }
    });
}

// ==========================================
// 独立函数 2：请求 Jable -c 后缀
// ==========================================
function runJableCSearch(code) {
    let jableUrlC = `https://jable.tv/videos/${code}-c/`;
    $httpClient.get({
        url: jableUrlC,
        headers: getFakeHeaders()
    }, function(error, response, data) {
        let foundM3u8 = false;
        
        if (!error && response && response.status === 200) {
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
            let m3u8Match = data ? data.match(m3u8Reg) : null;
            if (m3u8Match) {
                foundM3u8 = true;
                handleSuccess(code, m3u8Match[0], "Jable");
            }
        }
        
        if (!foundM3u8) {
            console.log(`[JavDB-SenPlayer] ❌ Jable 原番号及 -c 后缀均未找到，解析结束。`);
            $done({ body });
        }
    });
}

// ==========================================
// 伪装请求头
// ==========================================
function getFakeHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
        "Connection": "keep-alive"
    };
}

// ==========================================
// 提取成功后的处理函数
// ==========================================
function handleSuccess(code, m3u8, source) {
    console.log(`\n==================================`);
    console.log(`🎯 [成功获取 M3U8] 数据源: ${source}`);
    console.log(`🔗 播放链接: ${m3u8}`);
    console.log(`==================================\n`);
    
    let shortcutUrl = `shortcuts://run-shortcut?name=JavPlay&input=text&text=${encodeURIComponent(m3u8)}`;
    let title = `▶ 解析成功 (${source}): ${code.toUpperCase()}`;
    let subtitle = `已找到串流链接并记录至日志`;
    let content = `👇 点击弹窗立即拉起 SenPlayer`;

    if (typeof $environment !== 'undefined' && $environment['stash-version']) {
        $notification.post(title, subtitle, content, { url: shortcutUrl });
    } else {
        $notification.post(title, subtitle, content, shortcutUrl);
    }
    $done({ body });
}