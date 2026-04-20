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
        
        // 🌟 核心防误弹逻辑 🌟
        // 超过 5 个不同番号，说明是首页推荐或列表，直接跳过
        if (uniqueCodes.size > 5) {
            $done({ body });
        } else {
            // 取第一个匹配到的作为目标番号
            let code = allMatches[0].toLowerCase();
            
            // --- 防并发锁 ---
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
        
        let m3u8Reg = /https?:\/\/[^"'\`\s<>]+\.m3u8/i;
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
        
        let m3u8Reg = /https?:\/\/[^"'\`\s<>]+\.m3u8/i;
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
// 第 3 顺位：请求 Missav 
// ==========================================
function runMissavSearch(code) {
    let missavUrl = `https://missav.ai/cn/${code}`;
    $httpClient.get({
        url: missavUrl,
        headers: getFakeHeaders("missav") // 使用针对 Missav 的特殊 Header
    }, function(error, response, data) {
        if (error || !response || response.status !== 200) {
            console.log(`[JavDB-SenPlayer] ❌ Missav 未找到该资源 (404/拦截)，全网搜索结束。`);
            $done({ body });
            return;
        }
        
        // 调用我们新增的超强提取引擎
        let m3u8 = extractM3u8FromMissav(data);
        
        if (m3u8) {
            handleSuccess(code, m3u8, "Missav");
        } else {
            console.log(`[JavDB-SenPlayer] ❌ Missav 页面存在，但 M3U8 提取失败 (加密过强或无视频源)，解析结束。`);
            $done({ body });
        }
    });
}

// ==========================================
// 🌟 核心科技：Missav 专用解密与提取引擎 🌟
// ==========================================
function extractM3u8FromMissav(html) {
    if (!html) return null;
    
    // 1. 去除干扰字符，处理基础转义
    let text = html.replace(/\\\//g, "/");
    let m3u8Reg = /https?:\/\/[^"'\`\s<>]+\.m3u8[^"'\`\s<>]*/i;
    
    // 2. 尝试第一层：直接正则匹配（如果他们没加密的话）
    let match = text.match(m3u8Reg);
    if (match) return match[0];
    
    // 3. 尝试第二层：解密 eval(function(p,a,c,k,e,d)...)
    // 很多网站喜欢把真实地址混淆压缩在这段 JS 里面
    let packReg = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)[\s\S]+?\}\s*\(\s*(['"])([\s\S]+?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]+?)\5\.split\('\|'\)/g;
    let packMatch;
    
    while ((packMatch = packReg.exec(text)) !== null) {
        try {
            let p = packMatch[2];
            let a = parseInt(packMatch[3]);
            let c = parseInt(packMatch[4]);
            let k = packMatch[6].split('|');
            
            let e = function(c) {
                return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
            };
            
            while (c--) {
                if (k[c]) {
                    p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
                }
            }
            
            // 在解密出来的原始代码中找 m3u8
            p = p.replace(/\\\//g, "/");
            let innerMatch = p.match(m3u8Reg);
            if (innerMatch) {
                console.log(`[JavDB-SenPlayer] 🔓 成功破解 Missav 加密代码，获取到真实链接！`);
                return innerMatch[0];
            }
        } catch (err) {
            // 解析单段失败，继续尝试下一个加密块
        }
    }
    
    // 4. 尝试第三层：终极备用方案 (暴力提取 UUID 组装)
    // 如果找到了类似 a1b2c3d4-e5f6... 的视频专有 UUID，直接尝试套用 Missav 常见的主干节点
    let uuidReg = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;
    let uuidMatch = text.match(uuidReg);
    if (uuidMatch) {
        let uuid = uuidMatch[1];
        console.log(`[JavDB-SenPlayer] ⚠️ 未直接找到 M3U8，尝试使用提取的 UUID 强行组装备用链接: ${uuid}`);
        return `https://surrit.com/${uuid}/playlist.m3u8`;
    }
    
    return null;
}

// ==========================================
// 伪装请求头 (增加应对机制)
// ==========================================
function getFakeHeaders(type) {
    let headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9,en;q=0.8",
        "Connection": "keep-alive"
    };
    
    // 针对 Missav 加一点特殊的伪装，防止被盾
    if (type === "missav") {
        headers["Referer"] = "https://missav.ai/";
        headers["Cookie"] = "vip=1; age_warning_done=1;"; 
    }
    return headers;
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