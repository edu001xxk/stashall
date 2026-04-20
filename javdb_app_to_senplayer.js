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

function runMissavSearch(code) {
    let missavUrl = `https://missav.ai/cn/${code}`;
    $httpClient.get({ url: missavUrl, headers: getFakeHeaders("missav") }, function(error, response, data) {
        if (error || !response || response.status !== 200) {
            $notification.post(`❌ 解析失败`, code.toUpperCase(), `Missav 网页无法访问 (节点可能被屏蔽)`);
            $done({ body });
            return;
        }
        
        let m3u8 = extractM3u8FromMissav(data);
        
        if (m3u8 === "CF_BLOCKED") {
            $notification.post(`🛡️ 解析拦截`, code.toUpperCase(), `触发了 Missav 的 Cloudflare 盾，请手动在浏览器打开一次该网页进行人机验证`);
            $done({ body });
            return;
        }
        
        if (m3u8) handleSuccess(code, m3u8, "Missav");
        else {
            $notification.post(`❌ 解析失败`, code.toUpperCase(), `网页中未找到视频链接，可能已下架或加密变更`);
            $done({ body });
        }
    });
}

// ==========================================
// 🌟 大结局提取引擎：全能解密 + 碎片拼接
// ==========================================
function extractM3u8FromMissav(html) {
    if (!html) return null;
    
    // 1. 拦截 Cloudflare 人机验证页面
    if (html.includes("cf-turnstile") || html.includes("Just a moment") || html.includes("Cloudflare")) {
        return "CF_BLOCKED";
    }

    let cleanHtml = html.replace(/\\/g, ""); 
    let m3u8Reg = /https?:\/\/[^"'\`\s<>]+\.m3u8[^"'\`\s<>]*/i;
    
    // 2. 直提 (有些时候签名的 URL 是明文的)
    let directMatch = cleanHtml.match(m3u8Reg);
    if (directMatch && directMatch[0].includes("?")) {
        return directMatch[0];
    }

    // 3. 通用 JS 解密器 (正则强化：无视被篡改的变量名)
    let packReg = /eval\s*\(\s*function\s*\([\w\s,]+\)[\s\S]+?\}\s*\(\s*(['"])([\s\S]+?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]+?)\5\.split\('\|'\)/g;
    let packMatch;
    while ((packMatch = packReg.exec(html)) !== null) {
        try {
            let p = packMatch[2]; 
            let a = parseInt(packMatch[3]); 
            let c = parseInt(packMatch[4]); 
            let k = packMatch[6].split('|');
            let e = function(c) { return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36)); };
            while (c--) { if (k[c]) { p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]); } }
            
            let unpacked = p.replace(/\\/g, "");
            let innerMatch = unpacked.match(m3u8Reg);
            
            // 只要解密出来的链接带问号参数，就是带动态签名的真链接
            if (innerMatch && innerMatch[0].includes("?")) {
                return innerMatch[0];
            }
        } catch (err) {}
    }
    
    // 4. 碎片拼接法 (如果解密彻底失败，尝试搜刮页面上的零件自己拼)
    let uuidMatch = cleanHtml.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    let queryMatch = cleanHtml.match(/(\?(?:token|valid|t)=[^"'\`\s<>]+)/i); // 提取 ?token=xxx
    
    if (uuidMatch && queryMatch) {
        return `https://surrit.com/${uuidMatch[1]}/playlist.m3u8${queryMatch[1]}`;
    }

    // 5. 保底返回死链 (会触发 ❌ 缺防盗链签名的弹窗)
    if (directMatch) return directMatch[0];
    if (uuidMatch) return `https://surrit.com/${uuidMatch[1]}/playlist.m3u8`;
    
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
    
    let tokenStatus = "未知";
    if (source === "Missav") {
        if (m3u8.includes("?")) {
            tokenStatus = "✅ 含动态签名 (可以直接看)";
        } else {
            tokenStatus = "❌ 缺防盗链签名 (会导致403报错)";
        }
    } else {
        tokenStatus = "✅ 链接正常";
    }

    let title = `▶ ${source} : ${code.toUpperCase()}`;
    let subtitle = `诊断: ${tokenStatus}`;
    let content = `👇 点击弹窗立即拉起 SenPlayer`;

    if (typeof $environment !== 'undefined' && $environment['stash-version']) {
        $notification.post(title, subtitle, content, { url: shortcutUrl });
    } else {
        $notification.post(title, subtitle, content, shortcutUrl);
    }
    
    $done({ body });
}