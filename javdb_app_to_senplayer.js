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

function runMissavSearch(code) {
    let missavUrl = `https://missav.ai/cn/${code}`;
    $httpClient.get({ url: missavUrl, headers: getFakeHeaders("missav") }, function(error, response, data) {
        if (error || !response || response.status !== 200) {
            $notification.post(`❌ 解析失败`, code.toUpperCase(), `Missav 网页无法访问或被拦截`);
            $done({ body });
            return;
        }
        let m3u8 = extractM3u8FromMissav(data);
        if (m3u8) handleSuccess(code, m3u8, "Missav");
        else {
            $notification.post(`❌ 解析失败`, code.toUpperCase(), `Missav 网页存在，但提取代码完全失效`);
            $done({ body });
        }
    });
}

// ==========================================
// 强化版解密提取引擎 (修复转义字符破坏加密包的问题)
// ==========================================
function extractM3u8FromMissav(html) {
    if (!html) return null;
    let m3u8Reg = /https?:\/\/[^"'\`\s<>]+\.m3u8[^"'\`\s<>]*/i;
    
    // 方法1：直接清理网页特征进行匹配 (还原 unicode 字符)
    let cleanHtml = html.replace(/\\\//g, "/").replace(/\\u0026/g, "&");
    let directMatch = cleanHtml.match(m3u8Reg);
    
    // 如果直接匹配到了，并且里面带有 token 签名，这才是真链接！
    if (directMatch && directMatch[0].includes("token=")) {
        return directMatch[0];
    }
    
    // 方法2：破解动态生成的 JS 加密包
    let packReg = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)[\s\S]+?\}\s*\(\s*(['"])([\s\S]+?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]+?)\5\.split\('\|'\)/g;
    let packMatch;
    
    while ((packMatch = packReg.exec(html)) !== null) {
        try {
            let p = packMatch[2]; let a = parseInt(packMatch[3]); let c = parseInt(packMatch[4]); let k = packMatch[6].split('|');
            let e = function(c) { return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36)); };
            while (c--) { if (k[c]) { p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]); } }
            
            // 还原破解出代码的特殊字符
            let unpacked = p.replace(/\\\//g, "/").replace(/\\u0026/g, "&");
            let innerMatch = unpacked.match(m3u8Reg);
            if (innerMatch) return innerMatch[0];
        } catch (err) {}
    }
    
    // 方法3：保底直接匹配 (没有 token，可能报403)
    if (directMatch) return directMatch[0];
    
    // 方法4：强行组装 UUID (绝对报 403，仅用于测试死马当活马医)
    let uuidReg = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;
    let uuidMatch = html.match(uuidReg);
    if (uuidMatch) {
        return `https://surrit.com/${uuidMatch[1]}/playlist.m3u8`;
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

// ==========================================
// 💡 可视化诊断通知 💡
// ==========================================
function handleSuccess(code, m3u8, source) {
    let shortcutUrl = `shortcuts://run-shortcut?name=JavPlay&input=text&text=${encodeURIComponent(m3u8)}`;
    
    // 判断抓取到的链接质量
    let tokenStatus = "未知";
    if (source === "Missav") {
        if (m3u8.includes("token=")) {
            tokenStatus = "✅ 含动态签名 (应该是正常链接)";
        } else {
            tokenStatus = "❌ 缺失防盗链签名 (会导致403报错)";
        }
    }

    let title = `▶ ${source} : ${code.toUpperCase()}`;
    let subtitle = (source === "Missav") ? `诊断状态: ${tokenStatus}` : `已找到解析链接`;
    let content = `链接截取: ${m3u8.substring(0, 45)}...\n👇 点击拉起 SenPlayer`;

    if (typeof $environment !== 'undefined' && $environment['stash-version']) {
        $notification.post(title, subtitle, content, { url: shortcutUrl });
    } else {
        $notification.post(title, subtitle, content, shortcutUrl);
    }
    
    $done({ body });
}