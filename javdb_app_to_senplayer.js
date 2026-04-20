let body = (typeof $response !== "undefined" && $response.body) ? $response.body : "";

if (!body) {
    $done({});
} else {
    let idRegGlobal = /([a-zA-Z]{2,6}-\d{3,5})/gi;
    let allMatches = body.match(idRegGlobal);

    if (allMatches && allMatches.length > 0) {
        let uniqueCodes = new Set(allMatches.map(c => c.toLowerCase()));
        
        if (uniqueCodes.size > 5) {
            $done({ body });
        } else {
            let code = allMatches[0].toLowerCase();
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
                runJableSearch(code);
            }
        }
    } else {
        $done({ body });
    }
}

// ==========================================
function runJableSearch(code) {
    let jableUrl = `https://jable.tv/videos/${code}/`;
    $httpClient.get({ url: jableUrl, headers: getFakeHeaders() }, function(error, response, data) {
        if (error || !response || response.status !== 200) {
            runJableCSearch(code);
            return;
        }
        let m3u8Reg = /https?:\/\/[^"'\`\s<>]+\.m3u8[^"'\`\s<>]*/i;
        let m3u8Match = data ? data.match(m3u8Reg) : null;
        if (m3u8Match) handleSuccess(code, m3u8Match[0], "Jable");
        else runJableCSearch(code);
    });
}

// ==========================================
function runJableCSearch(code) {
    let jableUrlC = `https://jable.tv/videos/${code}-c/`;
    $httpClient.get({ url: jableUrlC, headers: getFakeHeaders() }, function(error, response, data) {
        if (error || !response || response.status !== 200) {
            runMissavSearch(code);
            return;
        }
        let m3u8Reg = /https?:\/\/[^"'\`\s<>]+\.m3u8[^"'\`\s<>]*/i;
        let m3u8Match = data ? data.match(m3u8Reg) : null;
        if (m3u8Match) handleSuccess(code, m3u8Match[0], "Jable (-c)");
        else runMissavSearch(code);
    });
}

// ==========================================
function runMissavSearch(code) {
    let missavUrl = `https://missav.ai/cn/${code}`;
    $httpClient.get({ url: missavUrl, headers: getFakeHeaders("missav") }, function(error, response, data) {
        if (error || !response || response.status !== 200) {
            $done({ body });
            return;
        }
        let m3u8 = extractM3u8FromMissav(data);
        if (m3u8) handleSuccess(code, m3u8, "Missav");
        else $done({ body });
    });
}

// ==========================================
function extractM3u8FromMissav(html) {
    if (!html) return null;
    let text = html.replace(/\\/g, ""); // 去除所有反斜杠转义
    let m3u8Reg = /https?:\/\/[^"'\`\s<>]+\.m3u8[^"'\`\s<>]*/i;
    
    // 1. 直提
    let match = text.match(m3u8Reg);
    if (match) return match[0];
    
    // 2. 解密提取
    let packReg = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)[\s\S]+?\}\s*\(\s*(['"])([\s\S]+?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]+?)\5\.split\('\|'\)/g;
    let packMatch;
    
    while ((packMatch = packReg.exec(text)) !== null) {
        try {
            let p = packMatch[2]; let a = parseInt(packMatch[3]); let c = parseInt(packMatch[4]); let k = packMatch[6].split('|');
            let e = function(c) { return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36)); };
            while (c--) { if (k[c]) { p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]); } }
            
            let innerMatch = p.match(m3u8Reg);
            if (innerMatch) return innerMatch[0];
        } catch (err) {}
    }
    return null;
}

function getFakeHeaders(type) {
    let headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    };
    if (type === "missav") headers["Cookie"] = "vip=1; age_warning_done=1;"; 
    return headers;
}

function handleSuccess(code, m3u8, source) {
    let shortcutUrl = `shortcuts://run-shortcut?name=JavPlay&input=text&text=${encodeURIComponent(m3u8)}`;
    let title = `▶ 解析成功 (${source}): ${code.toUpperCase()}`;
    let subtitle = `已找到纯净播放链接`;
    let content = `👇 点击弹窗立即拉起 SenPlayer`;

    if (typeof $environment !== 'undefined' && $environment['stash-version']) {
        $notification.post(title, subtitle, content, { url: shortcutUrl });
    } else {
        $notification.post(title, subtitle, content, shortcutUrl);
    }
    $done({ body });
}