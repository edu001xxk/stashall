let originalBody = typeof $response !== 'undefined' ? $response.body : null;

if (originalBody) {
    let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
    let match = originalBody.match(idReg);

    if (match && match[1]) {
        let code = match[1].toLowerCase();
        console.log(`\n[JavDB-SenPlayer] 🔍 开始搜索番号: ${code.toUpperCase()}`);

        checkJable(code, false);
    } else {
        $done({ body: originalBody });
    }
} else {
    $done({});
}

// ==========================================
// 顺位一：Jable
// ==========================================
function checkJable(code, isRetry) {
    let targetCode = isRetry ? `${code}-c` : code;
    let url = `https://jable.tv/videos/${targetCode}/`;
    
    $httpClient.get({
        url: url,
        headers: getFakeHeaders()
    }, function(err, resp, data) {
        if (!err && resp && resp.status === 200) {
            let m3u8Url = findStream(data, "https://jable.tv");
            if (m3u8Url) {
                handleSuccess(code, m3u8Url, "Jable");
                return;
            }
        }
        
        if (!isRetry) {
            console.log(`[JavDB-SenPlayer] ⚠️ Jable 未找到，尝试 -c 后缀...`);
            checkJable(code, true);
        } else {
            console.log(`[JavDB-SenPlayer] ⚠️ Jable 均未找到，转去第二顺位 MissAV...`);
            fetchMissAV(`https://missav.ws/cn/${code}`, code, 0);
        }
    });
}

// ==========================================
// 顺位二：MissAV 
// ==========================================
function fetchMissAV(url, code, step) {
    if (step > 2) {
        console.log(`[JavDB-SenPlayer] ⚠️ MissAV 尝试耗尽，转去第三顺位 SupJav...`);
        fetchSupJav(`https://supjav.com/zh/?s=${code}`, code, 0);
        return;
    }

    $httpClient.get({
        url: url,
        headers: getFakeHeaders()
    }, function(err, resp, data) {
        if (err || !resp || resp.status === 403 || resp.status === 503) {
            console.log(`[JavDB-SenPlayer] ❌ MissAV 报错或遭遇 CF 盾，转去 SupJav...`);
            fetchSupJav(`https://supjav.com/zh/?s=${code}`, code, 0);
            return;
        }

        if (resp.status >= 300 && resp.status < 400) {
            let loc = resp.headers['Location'] || resp.headers['location'];
            if (loc) {
                if (loc.startsWith('/')) loc = "https://missav.ws" + loc;
                fetchMissAV(loc, code, step + 1);
            } else {
                fetchSupJav(`https://supjav.com/zh/?s=${code}`, code, 0);
            }
            return;
        }

        let dataStr = (data && resp.status === 200) ? data.replace(/\\/g, "") : "";
        let m3u8Url = findStream(dataStr, "https://missav.ws");

        if (m3u8Url) {
            handleSuccess(code, m3u8Url, "MissAV");
            return;
        }

        if (step === 0) {
            fetchMissAV(`https://missav.ws/cn/search/${code}`, code, 1);
        } else if (step === 1) {
            let pureCode = code.replace("-", "");
            let linkReg = new RegExp(`href=["'](https?:\/\/[^"']*missav[^"']*\/(?:cn|en)\/[^"']*(?:${code}|${pureCode})[^"']*)["']`, "i");
            let linkMatch = dataStr.match(linkReg);
            
            if (linkMatch && linkMatch[1]) {
                console.log(`[JavDB-SenPlayer] 🔗 找到 MissAV 视频页，钻入...`);
                fetchMissAV(linkMatch[1], code, 2);
            } else {
                console.log(`[JavDB-SenPlayer] ⚠️ MissAV 搜索无结果，转去 SupJav...`);
                fetchSupJav(`https://supjav.com/zh/?s=${code}`, code, 0);
            }
        } else {
            console.log(`[JavDB-SenPlayer] ⚠️ MissAV 详情页未找到直链，转去 SupJav...`);
            fetchSupJav(`https://supjav.com/zh/?s=${code}`, code, 0);
        }
    });
}

// ==========================================
// 顺位三：SupJav
// ==========================================
function fetchSupJav(url, code, step) {
    if (step > 2) {
        console.log(`[JavDB-SenPlayer] ⚠️ SupJav 尝试耗尽，转去第四顺位 JavGuru...`);
        fetchJavGuru(`https://jav.guru/?s=${code}`, code, 0);
        return;
    }

    $httpClient.get({
        url: url,
        headers: getFakeHeaders()
    }, function(err, resp, data) {
        if (err || !resp || resp.status === 403 || resp.status === 503) {
            console.log(`[JavDB-SenPlayer] ❌ SupJav 报错或遭遇 CF 盾，转去 JavGuru...`);
            fetchJavGuru(`https://jav.guru/?s=${code}`, code, 0);
            return;
        }

        if (resp.status >= 300 && resp.status < 400) {
            let loc = resp.headers['Location'] || resp.headers['location'];
            if (loc) {
                if (loc.startsWith('/')) loc = "https://supjav.com" + loc;
                fetchSupJav(loc, code, step + 1);
            } else {
                fetchJavGuru(`https://jav.guru/?s=${code}`, code, 0);
            }
            return;
        }

        let dataStr = (data && resp.status === 200) ? data.replace(/\\/g, "") : "";
        let m3u8Url = findStream(dataStr, "https://supjav.com");

        if (m3u8Url) {
            handleSuccess(code, m3u8Url, "SupJav");
            return;
        }

        if (step === 0) {
            let linkReg = /href=["'](https?:\/\/(?:www\.)?supjav\.com\/(?:[a-z]{2}\/)?\w+\.html)["']/i;
            let linkMatch = dataStr.match(linkReg);

            if (linkMatch && linkMatch[1]) {
                console.log(`[JavDB-SenPlayer] 🔗 找到 SupJav 视频页，钻入...`);
                fetchSupJav(linkMatch[1], code, 1);
            } else {
                console.log(`[JavDB-SenPlayer] ⚠️ SupJav 搜索无结果，转去 JavGuru...`);
                fetchJavGuru(`https://jav.guru/?s=${code}`, code, 0);
            }
        } else if (step === 1) {
            let iframeUrl = extractIframe(dataStr, "https://supjav.com");
            if (iframeUrl) {
                console.log(`[JavDB-SenPlayer] 🔍 SupJav 发现嵌套播放器，钻入...`);
                fetchSupJav(iframeUrl, code, 2);
            } else {
                console.log(`[JavDB-SenPlayer] ⚠️ SupJav 视频页未找到播放器，转去 JavGuru...`);
                fetchJavGuru(`https://jav.guru/?s=${code}`, code, 0);
            }
        } else {
            console.log(`[JavDB-SenPlayer] ⚠️ SupJav 未找到直链，转去 JavGuru...`);
            fetchJavGuru(`https://jav.guru/?s=${code}`, code, 0);
        }
    });
}

// ==========================================
// 顺位四：JavGuru (终极兜底 - 开启无限套娃穿透)
// ==========================================
function fetchJavGuru(url, code, step) {
    if (step > 4) { // 最高允许钻探 4 层 iframe
        console.log(`[JavDB-SenPlayer] ❌ JavGuru 嵌套过深，所有站源均未找到该影片。`);
        $done({ body: originalBody });
        return;
    }

    $httpClient.get({
        url: url,
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh-Hans;q=0.9",
            "Referer": url // 保留 Referer 防止防盗链
        }
    }, function(err, resp, data) {
        if (err || !resp || resp.status === 403 || resp.status === 503) {
            console.log(`[JavDB-SenPlayer] ❌ JavGuru 报错或遭遇 CF 盾，搜索终止。`);
            $done({ body: originalBody });
            return;
        }

        if (resp.status >= 300 && resp.status < 400) {
            let loc = resp.headers['Location'] || resp.headers['location'];
            if (loc) {
                if (loc.startsWith('/')) loc = "https://jav.guru" + loc;
                fetchJavGuru(loc, code, step + 1);
            } else {
                $done({ body: originalBody });
            }
            return;
        }

        let dataStr = (data && resp.status === 200) ? data.replace(/\\/g, "") : "";
        let m3u8Url = findStream(dataStr, "https://jav.guru");

        if (m3u8Url) {
            handleSuccess(code, m3u8Url, "JavGuru");
            return;
        }

        if (step === 0) {
            // 第 0 层：在搜索页提取视频详情页链接
            let pureCode = code.replace("-", "");
            let linkReg = new RegExp(`href=["'](https?:\\/\\/jav\\.guru\\/\\d+\\/[^"']*(?:${code}|${pureCode})[^"']*)["']`, "i");
            let linkMatch = dataStr.match(linkReg);
            
            if (!linkMatch) {
                linkMatch = dataStr.match(/href=["'](https?:\/\/jav\.guru\/\d+\/[^"']+)["']/i);
            }

            if (linkMatch && linkMatch[1]) {
                console.log(`[JavDB-SenPlayer] 🔗 找到 JavGuru 视频页，钻入...`);
                fetchJavGuru(linkMatch[1], code, 1);
            } else {
                console.log(`[JavDB-SenPlayer] ❌ JavGuru 搜索无结果，搜索终止。`);
                $done({ body: originalBody });
            }
        } else {
            // 第 1, 2, 3 层：如果没有直链，继续在当前页面寻找下一层嵌套的 iframe
            let iframeUrl = extractIframe(dataStr, "https://jav.guru");
            if (iframeUrl) {
                console.log(`[JavDB-SenPlayer] 🔍 深入第 ${step} 层嵌套播放器: ${iframeUrl}`);
                fetchJavGuru(iframeUrl, code, step + 1);
            } else {
                console.log(`[JavDB-SenPlayer] ❌ 第 ${step} 层未找到下层嵌套或直链，搜索终止。`);
                $done({ body: originalBody });
            }
        }
    });
}

// ==========================================
// 通用工具：提取 M3U8/MP4 直链
// ==========================================
function findStream(data, domain) {
    if (!data) return null;
    let streamReg = /(?:https?:)?\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*/i;
    let match = data.match(streamReg);
    if (match) {
        let url = match[0];
        if (url.startsWith("//")) url = "https:" + url;
        return url;
    }
    
    let relReg = /["'](\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*)/i;
    let relMatch = data.match(relReg);
    if (relMatch) {
        return domain + relMatch[1];
    }
    return null;
}

// ==========================================
// 通用工具：提取 iframe 播放器链接 (增强雷达，优先锁定真实播放器)
// ==========================================
function extractIframe(html, domain) {
    if (!html) return null;
    let iframeReg = /<iframe[^>]+src=["']([^"']+)["']/gi;
    let match;
    let fallbackUrl = null;
    
    while ((match = iframeReg.exec(html)) !== null) {
        let url = match[1];
        // 过滤常见的广告、弹窗链接
        if (!url.includes("ads") && !url.includes("banner") && !url.includes("ad.html") && !url.includes("pop")) {
            if (url.startsWith("//")) url = "https:" + url;
            else if (url.startsWith("/")) url = domain + url;
            
            // 优先返回带有播放器特征的链接
            if (url.includes("play") || url.includes("video") || url.includes("embed") || url.includes("player")) {
                return url;
            }
            if (!fallbackUrl) fallbackUrl = url;
        }
    }
    return fallbackUrl;
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
function handleSuccess(code, url, source) {
    console.log(`\n==================================`);
    console.log(`🎯 [成功获取资源] 数据源: ${source}`);
    console.log(`🔗 播放链接: ${url}`);
    console.log(`==================================\n`);
    
    let shortcutUrl = `shortcuts://run-shortcut?name=JavPlay&input=text&text=${encodeURIComponent(url)}`;
    let title = `▶ 解析成功 (${source}): ${code.toUpperCase()}`;
    let subtitle = `已找到串流链接并记录至日志`;
    let content = `👇 点击弹窗立即拉起 SenPlayer`;

    if (typeof $environment !== 'undefined' && $environment['stash-version']) {
        $notification.post(title, subtitle, content, { url: shortcutUrl });
    } else {
        $notification.post(title, subtitle, content, shortcutUrl);
    }
    $done({ body: originalBody });
}