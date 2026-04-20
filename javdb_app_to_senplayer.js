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
        
        // 🌟 恢复原本好用的防误弹逻辑 🌟
        // 如果包含超过 5 个不同的番号，说明是首页推荐或列表，直接跳过！
        if (uniqueCodes.size > 5) {
            $done({ body });
        } else {
            // 取第一个匹配到的作为目标番号
            let code = allMatches[0].toLowerCase();
            
            // --- Stash 10秒防并发锁 ---
            let cacheKey = "javdb_stash_lock_" + code;
            let now = Date.now();
            let lastTime = 0;

            if (typeof $persistentStore !== "undefined") {
                let cacheStr = $persistentStore.read(cacheKey);
                if (cacheStr) lastTime = parseInt(cacheStr);
            }

            if (now - lastTime < 10000) {
                console.log(`[JavDB-SenPlayer] ♻️ 防抖拦截: 10秒内重复请求了 ${code.toUpperCase()}`);
                $done({ body });
            } else {
                if (typeof $persistentStore !== "undefined") {
                    $persistentStore.write(now.toString(), cacheKey);
                }
                
                console.log(`\n[JavDB-SenPlayer] 🔍 确认进入详情页，开始搜索番号: ${code.toUpperCase()}`);
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
    $httpClient.get({
        url: jableUrl,
        headers: getFakeHeaders()
    }, function(error, response, data) {
        if (error || !response || response.status !== 200) {
            console.log(`[JavDB-SenPlayer] ⚠️ Jable 未找到原番号 (404)，尝试带 -c 后缀...`);
            runJableCSearch(code);
            return;
        }
        
        let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
        let m3u8Match = data ? data.match(m3u8Reg) : null;
        
        if (m3u8Match) {
            handleSuccess(code, m3u8Match[0], "Jable");
        } else {
            console.log(`[JavDB-SenPlayer] ⚠️ Jable 页面存在但未提取到 M3U8，尝试带 -c 后缀...`);
            runJableCSearch(code);
        }
    });
}

// ==========================================
// 第 2 顺位：请求 Jable -c 后缀
// ==========================================
function runJableCSearch(code) {
    let jableUrlC = `https://jable.tv/videos/${code}-c/`;
    $httpClient.get({
        url: jableUrlC,
        headers: getFakeHeaders()
    }, function(error, response, data) {
        if (error || !response || response.status !== 200) {
            console.log(`[JavDB-SenPlayer] ⚠️ Jable -c 后缀未找到 (404)，转去 Missav...`);
            runMissavSearch(code);
            return;
        }
        
        let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
        let m3u8Match = data ? data.match(m3u8Reg) : null;
        
        if (m3u8Match) {
            handleSuccess(code, m3u8Match[0], "Jable (-c)");
        } else {
            console.log(`[JavDB-SenPlayer] ⚠️ Jable -c 未提取到 M3U8，转去 Missav...`);
            runMissavSearch(code);
        }
    });
}

// ==========================================
// 第 3 顺位：请求 Missav (使用新域名 missav.ai)
// ==========================================
function runMissavSearch(code) {
    // 🌟 更新为最新的 Missav 域名 🌟
    let missavUrl = `https://missav.ai/cn/${code}`;
    $httpClient.get({
        url: missavUrl,
        headers: getFakeHeaders()
    }, function(error, response, data) {
        if (error || !response || response.status !== 200) {
            console.log(`[JavDB-SenPlayer] ❌ Missav (missav.ai) 也未找到该资源 (404)，全网搜索结束。`);
            $done({ body });
            return;
        }
        
        // Missav 转义字符复原
        let htmlData = data ? data.replace(/\\\//g, "/") : "";
        let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
        let m3u8Match = htmlData.match(m3u8Reg);
        
        if (m3u8Match) {
            handleSuccess(code, m3u8Match[0], "Missav");
        } else {
            console.log(`[JavDB-SenPlayer] ❌ Missav 页面存在但未提取到播放链接，解析结束。`);
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