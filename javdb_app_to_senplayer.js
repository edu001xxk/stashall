// 安全获取 url 和 body，防止 Stash 环境变量缺失报错
let url = (typeof $request !== "undefined" && $request.url) ? $request.url : "";
let body = (typeof $response !== "undefined" && $response.body) ? $response.body : "";

if (!body) {
    $done({});
} 
// 1. 路由过滤：如果你打开的是首页、列表页等，Stash 直接放行，不执行搜索，解决“刚打开App就弹窗”
else if (url.match(/\/(home|index|list|rank|search|actors|makers|popular|trending|update)/i)) {
    $done({ body });
} 
// 2. 核心执行逻辑
else {
    let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
    let match = body.match(idReg);

    if (match && match[1]) {
        let code = match[1].toLowerCase();
        
        // ==========================================
        // Stash 专用：10秒并发锁 (解决1~2秒内连续弹窗两次)
        // ==========================================
        let cacheKey = "javdb_stash_lock_" + code;
        let now = Date.now();
        let lastTime = 0;

        // Stash 支持 $persistentStore API 进行本地持久化存储
        if (typeof $persistentStore !== "undefined") {
            let cacheStr = $persistentStore.read(cacheKey);
            if (cacheStr) lastTime = parseInt(cacheStr);
        }

        // 如果距离上次搜索这个番号不到 10 秒（10000毫秒），直接结束
        if (now - lastTime < 10000) {
            console.log(`\n[JavDB-SenPlayer] ♻️ Stash 防抖拦截: 10秒内重复请求了 ${code.toUpperCase()}`);
            $done({ body });
        } else {
            // 写入当前时间，锁定这个番号 10 秒
            if (typeof $persistentStore !== "undefined") {
                $persistentStore.write(now.toString(), cacheKey);
            }
            
            console.log(`\n[JavDB-SenPlayer] 🔍 开始搜索番号: ${code.toUpperCase()}`);
            runJableSearch(code);
        }
    } else {
        // 没有找到番号，直接放行
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
// 伪装请求头（完全保留原样）
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
// 提取成功后的处理函数（包含 Stash 专用的弹窗参数格式）
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

    // Stash 的 notification 支持传入包含 url 的对象实现点击跳转
    if (typeof $environment !== 'undefined' && $environment['stash-version']) {
        $notification.post(title, subtitle, content, { url: shortcutUrl });
    } else {
        $notification.post(title, subtitle, content, shortcutUrl);
    }
    
    $done({ body });
}