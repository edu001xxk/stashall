// 获取请求信息
let url = (typeof $request !== "undefined" && $request.url) ? $request.url : "";
let body = (typeof $response !== "undefined" && $response.body) ? $response.body : "";

if (!body) {
    $done({});
} 
// ==========================================
// 1. 正向详情页判定 (解决首页弹窗的关键)
// ==========================================
// JavDB 的详情页 URL 必定包含 "/v/"。
// 如果 URL 中不包含 "/v/"，说明是首页、搜索列表、排行等，直接退出。
else if (!url.includes("/v/")) {
    // console.log(`[JavDB-SenPlayer] 🔍 非详情页 (${url})，跳过解析。`);
    $done({ body });
} 
// ==========================================
// 2. 详情页处理逻辑
// ==========================================
else {
    // 匹配标准番号
    let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
    let match = body.match(idReg);

    if (match && match[1]) {
        let code = match[1].toLowerCase();
        
        // --- Stash 10秒防并发锁 ---
        let cacheKey = "javdb_lock_final_" + code;
        let now = Date.now();
        let lastTime = 0;

        if (typeof $persistentStore !== "undefined") {
            let cacheStr = $persistentStore.read(cacheKey);
            if (cacheStr) lastTime = parseInt(cacheStr);
        }

        // 10秒防抖
        if (now - lastTime < 10000) {
            console.log(`\n[JavDB-SenPlayer] ♻️ 拦截重复请求: ${code.toUpperCase()}`);
            $done({ body });
        } else {
            // 写入锁
            if (typeof $persistentStore !== "undefined") {
                $persistentStore.write(now.toString(), cacheKey);
            }
            
            console.log(`\n[JavDB-SenPlayer] 🎯 详情页确认: ${url}`);
            console.log(`[JavDB-SenPlayer] 🔍 开始搜索番号: ${code.toUpperCase()}`);
            runJableSearch(code);
        }
    } else {
        $done({ body });
    }
}

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
            console.log(`[JavDB-SenPlayer] ⚠️ Jable 原番号未找到，尝试带 -c...`);
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
            console.log(`[JavDB-SenPlayer] ❌ 未找到资源，解析结束。`);
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
// 提取成功处理
// ==========================================
function handleSuccess(code, m3u8, source) {
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