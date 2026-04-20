let body = (typeof $response !== "undefined" && $response.body) ? $response.body : "";

if (!body) {
    $done({});
} else {
    // 提取 body 中所有的番号 (加了 g 标志进行全局匹配)
    let idRegGlobal = /([a-zA-Z]{2,6}-\d{3,5})/gi;
    let allMatches = body.match(idRegGlobal);

    if (allMatches && allMatches.length > 0) {
        // 转小写并去重，统计这个数据包里有多少个【不同】的番号
        let uniqueCodes = new Set(allMatches.map(c => c.toLowerCase()));
        
        // 核心防误弹逻辑：超过 5 个不同番号说明是列表页，直接跳过
        if (uniqueCodes.size > 5) {
            $done({ body });
        } else {
            let code = allMatches[0].toLowerCase();
            
            // --- 防并发锁 (防抖拦截) ---
            let cacheKey = "javdb_stash_lock_" + code;
            let now = Date.now();
            let lastTime = 0;

            if (typeof $persistentStore !== "undefined") {
                let cacheStr = $persistentStore.read(cacheKey);
                if (cacheStr) lastTime = parseInt(cacheStr);
            }

            // 10 秒内不重复弹窗执行
            if (now - lastTime < 10000) {
                $done({ body });
            } else {
                if (typeof $persistentStore !== "undefined") {
                    $persistentStore.write(now.toString(), cacheKey);
                }
                runJableSearch(code);
            }
        }
    } else {
        $done({ body });
    }
}

// ==========================================
// 第 1 顺位：请求 Jable 原番号
// ==========================================
function runJableSearch(code) {
    let jableUrl = `https://jable.tv/videos/${code}/`;
    $httpClient.get({ url: jableUrl, headers: getFakeHeaders() }, function(error, response, data) {
        if (error || !response || response.status !== 200) {
            runJableCSearch(code);
            return;
        }
        
        let m3u8Reg = /https?:\/\/[^"'\`\s<>]+\.m3u8[^"'\`\s<>]*\?[^"'\`\s<>]*/i;
        let m3u8Match = data ? data.match(m3u8Reg) : null;
        if (!m3u8Match) {
             m3u8Reg = /https?:\/\/[^"'\`\s<>]+\.m3u8/i;
             m3u8Match = data ? data.match(m3u8Reg) : null;
        }
        
        if (m3u8Match) handleSuccess(code, m3u8Match[0], "Jable");
        else runJableCSearch(code);
    });
}

// ==========================================
// 第 2 顺位：请求 Jable -c 后缀
// ==========================================
function runJableCSearch(code) {
    let jableUrlC = `https://jable.tv/videos/${code}-c/`;
    $httpClient.get({ url: jableUrlC, headers: getFakeHeaders() }, function(error, response, data) {
        if (error || !response || response.status !== 200) {
            runMissavSearch(code);
            return;
        }
        
        let m3u8Reg = /https?:\/\/[^"'\`\s<>]+\.m3u8[^"'\`\s<>]*\?[^"'\`\s<>]*/i;
        let m3u8Match = data ? data.match(m3u8Reg) : null;
        if (!m3u8Match) {
             m3u8Reg = /https?:\/\/[^"'\`\s<>]+\.m3u8/i;
             m3u8Match = data ? data.match(m3u8Reg) : null;
        }
        
        if (m3u8Match) handleSuccess(code, m3u8Match[0], "Jable (-c)");
        else runMissavSearch(code);
    });
}

// ==========================================
// 第 3 顺位：通过 Shortcuts 中转拉起 Scriptable 破盾提取
// ==========================================
function runMissavSearch(code) {
    let missavUrl = `https://missav.ai/cn/${code}`;
    
    // 1. 生成原本要给 Scriptable 的真实跳转链接 (使用官方标准参数)
    let scriptableUrl = `scriptable://run?scriptName=MissavExtractor&url=${encodeURIComponent(missavUrl)}`;
    
    // 2. 🌟 核心：套一层马甲！用快捷指令的协议把它包起来，完美骗过 Stash 的拦截
    let bridgeUrl = `shortcuts://run-shortcut?name=${encodeURIComponent('破盾桥梁')}&input=text&text=${encodeURIComponent(scriptableUrl)}`;
    
    let title = `▶ Missav 深度解析: ${code.toUpperCase()}`;
    let subtitle = `Jable 无资源，转交本地引擎过盾提取`;
    let content = `👇 点击此弹窗，全自动破盾并拉起 SenPlayer`;

    // 确保使用 Stash 官方要求的 { url: ... } 对象格式，兼容不同版本
    if (typeof $environment !== 'undefined' && $environment['stash-version']) {
        $notification.post(title, subtitle, content, { url: bridgeUrl });
    } else {
        $notification.post(title, subtitle, content, bridgeUrl);
    }
    
    $done({ body });
}

// ==========================================
// 工具：伪装请求头
// ==========================================
function getFakeHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    };
}

// ==========================================
// 工具：Jable 提取成功后的处理
// ==========================================
function handleSuccess(code, m3u8, source) {
    let shortcutUrl = `shortcuts://run-shortcut?name=JavPlay&input=text&text=${encodeURIComponent(m3u8)}`;
    let title = `▶ ${source} : ${code.toUpperCase()}`;
    let subtitle = `✅ 链接获取成功`;
    let content = `👇 点击弹窗立即拉起 SenPlayer`;

    if (typeof $environment !== 'undefined' && $environment['stash-version']) {
        $notification.post(title, subtitle, content, { url: shortcutUrl });
    } else {
        $notification.post(title, subtitle, content, shortcutUrl);
    }
    
    $done({ body });
}