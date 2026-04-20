let originalBody = typeof $response !== 'undefined' ? $response.body : null;

if (originalBody) {
    // 1. 匹配标准番号
    let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
    let match = originalBody.match(idReg);

    if (match && match[1]) {
        let code = match[1].toLowerCase();
        console.log(`\n[JavDB-SenPlayer] 🔍 开始搜索番号: ${code.toUpperCase()}`);

        // 启动搜索链
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
            fetchMissAV(`https://missav.ai/cn/${code}`, code, 0);
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

        // 处理重定向
        if (resp.status >= 300 && resp.status < 400) {
            let loc = resp.headers['Location'] || resp.headers['location'];
            if (loc) {
                if (loc.startsWith('/')) loc = "https://missav.ai" + loc;
                fetchMissAV(loc, code, step + 1);
            } else {
                fetchSupJav(`https://supjav.com/zh/?s=${code}`, code, 0);
            }
            return;
        }

        let dataStr = (data && resp.status === 200) ? data.replace(/\\/g, "") : "";
        let m3u8Url = findStream(dataStr, "https://missav.ai");

        if (m3u8Url) {
            handleSuccess(code, m3u8Url, "MissAV");
            return;
        }

        // 按层级深挖
        if (step === 0) {
            console.log(`[JavDB-SenPlayer] 尝试使用 MissAV 搜索接口...`);
            fetchMissAV(`https://missav.ai/cn/search/${code}`, code, 1);
        } else if (step === 1) {
            // 在搜索页寻找符合番号的详情链接 (兼容番号有没有横杠的情况)
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
// 顺位三：SupJav (兜底)
// ==========================================
function fetchSupJav(url, code, step) {
    if (step > 2) {
        console.log(`[JavDB-SenPlayer] ❌ SupJav 尝试耗尽，所有站源均未找到该影片。`);
        $done({ body: originalBody });
        return;
    }

    $httpClient.get({
        url: url,
        headers: getFakeHeaders()
    }, function(err, resp, data) {
        if (err || !resp || resp.status === 403 || resp.status === 503) {
            console.log(`[JavDB-SenPlayer] ❌ SupJav 报错或遭遇 CF 盾，搜索终止。`);
            $done({ body: originalBody });
            return;
        }

        // 处理重定向
        if (resp.status >= 300 && resp.status < 400) {
            let loc = resp.headers['Location'] || resp.headers['location'];
            if (loc) {
                if (loc.startsWith('/')) loc = "https://supjav.com" + loc;
                fetchSupJav(loc, code, step + 1);
            } else {
                $done({ body: originalBody });
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
            // 第 0 层：在搜索页提取 SupJav 视频页的链接
            // SupJav 链接通常为 /zh/12345.html
            let linkReg = /href=["'](https?:\/\/(?:www\.)?supjav\.com\/(?:[a-z]{2}\/)?\w+\.html)["']/i;
            let linkMatch = dataStr.match(linkReg);

            if (linkMatch && linkMatch[1]) {
                console.log(`[JavDB-SenPlayer] 🔗 找到 SupJav 视频页，钻入...`);
                fetchSupJav(linkMatch[1], code, 1);
            } else {
                console.log(`[JavDB-SenPlayer] ❌ SupJav 搜索无结果，搜索终止。`);
                $done({ body: originalBody });
            }
        } else if (step === 1) {
            // 第 1 层：在视频页寻找 iframe 播放器 (如 tv.supjav.com)
            let iframeMatch = dataStr.match(/<iframe[^>]+src=["'](https?:\/\/(?:tv|stream)\.supjav\.com\/[^"']+)["']/i);
            if (iframeMatch && iframeMatch[1]) {
                console.log(`[JavDB-SenPlayer] 🔍 SupJav 发现嵌套播放器，钻入...`);
                fetchSupJav(iframeMatch[1], code, 2);
            } else {
                console.log(`[JavDB-SenPlayer] ❌ SupJav 视频页未找到播放器，搜索终止。`);
                $done({ body: originalBody });
            }
        } else {
            console.log(`[JavDB-SenPlayer] ❌ 穷尽所有线路。`);
            $done({ body: originalBody });
        }
    });
}

// ==========================================
// 提取 M3U8/MP4 直链通用工具
// ==========================================
function findStream(data, domain) {
    if (!data) return null;
    
    // 匹配绝对路径或协议相对路径
    let streamReg = /(?:https?:)?\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*/i;
    let match = data.match(streamReg);
    if (match) {
        let url = match[0];
        if (url.startsWith("//")) url = "https:" + url;
        return url;
    }
    
    // 匹配相对路径
    let relReg = /["'](\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*)/i;
    let relMatch = data.match(relReg);
    if (relMatch) {
        return domain + relMatch[1];
    }
    return null;
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