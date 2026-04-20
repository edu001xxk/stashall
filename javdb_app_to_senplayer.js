let body = $response.body;

if (!body) {
    $done({});
}

// 1. 匹配标准番号
let idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
let match = body.match(idReg);

if (match && match[1]) {
    let code = match[1].toLowerCase();
    console.log(`\n[JavDB-SenPlayer] 🔍 开始搜索番号: ${code.toUpperCase()}`);

    // Jable 逻辑（保留你正常的重试机制）
    function checkJable(targetCode, isRetry) {
        let jableUrl = `https://jable.tv/videos/${targetCode}/`;
        $httpClient.get({
            url: jableUrl,
            headers: getFakeHeaders(jableUrl)
        }, function(error, response, data) {
            let foundM3u8 = false;
            if (!error && response.status === 200) {
                let m3u8Url = findM3u8(data, "https://jable.tv");
                if (m3u8Url) {
                    foundM3u8 = true;
                    handleSuccess(code, m3u8Url, "Jable");
                }
            }
            if (!foundM3u8) {
                if (!isRetry) {
                    console.log(`[JavDB-SenPlayer] ⚠️ Jable 原番号未找到，尝试加上 -c 后缀...`);
                    checkJable(`${code}-c`, true);
                } else {
                    console.log(`[JavDB-SenPlayer] ⚠️ Jable 均未找到，转去 123AV...`);
                    fetch123AV(`https://123av.com/zh/v/${code}`, code, 0);
                }
            }
        });
    }

    checkJable(code, false);

} else {
    $done({ body });
}

// ==========================================
// 核心：处理 123AV 请求
// ==========================================
function fetch123AV(url, code, redirectCount) {
    if (redirectCount > 4) {
        $done({ body });
        return;
    }
    
    $httpClient.get({
        url: url,
        headers: getFakeHeaders(url)
    }, function(err, resp, data) {
        if (err || !resp) {
            $done({ body });
            return;
        }
        
        if (resp.status === 403 || resp.status === 503) {
            console.log(`[JavDB-SenPlayer] 🛡️ 123AV 遭遇 CF 防护`);
            $done({ body });
            return;
        }
        
        // 处理重定向
        if (resp.status === 301 || resp.status === 302) {
            let location = resp.headers['Location'] || resp.headers['location'];
            if (location) {
                if (location.startsWith('/')) location = "https://123av.com" + location;
                fetch123AV(location, code, redirectCount + 1);
            } else {
                $done({ body });
            }
            return;
        }
        
        if (resp.status === 200 || resp.status === 404) {
            let dataStr = data ? data.replace(/\\/g, "") : "";
            // 使用增强型匹配器
            let m3u8Url = findM3u8(dataStr, "https://123av.com");

            if (m3u8Url && resp.status === 200) {
                handleSuccess(code, m3u8Url, "123AV");
            } else {
                // 找不到链接时，阶梯重试
                if (redirectCount === 0) {
                    console.log(`[JavDB-SenPlayer] 尝试 123AV -c 后缀...`);
                    fetch123AV(`https://123av.com/zh/v/${code}-c`, code, 1);
                } else if (redirectCount === 1) {
                    console.log(`[JavDB-SenPlayer] 尝试 123AV 搜索接口...`);
                    // 修正搜索 URL 格式
                    fetch123AV(`https://123av.com/zh/search?q=${code}`, code, 2);
                } else if (redirectCount === 2 && resp.status === 200) {
                    // 搜索页解析：寻找真正的详情页链接
                    let videoLinkReg = new RegExp(`href="([^"]*\/v\/${code}[^"]*)"`, "i");
                    let linkMatch = dataStr.match(videoLinkReg);
                    if (linkMatch && linkMatch[1]) {
                        let nextUrl = linkMatch[1].startsWith('/') ? "https://123av.com" + linkMatch[1] : linkMatch[1];
                        fetch123AV(nextUrl, code, 3);
                    } else {
                        $done({ body });
                    }
                } else {
                    $done({ body });
                }
            }
        } else {
            $done({ body });
        }
    });
}

// 增强型 M3U8 提取函数
function findM3u8(data, domain) {
    if (!data) return null;
    // 1. 匹配绝对链接或协议相对链接 (//开头)
    let m3u8Reg = /(?:https?:)?\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i;
    let match = data.match(m3u8Reg);
    if (match) {
        let url = match[0];
        if (url.startsWith("//")) url = "https:" + url;
        return url;
    }
    // 2. 匹配站内相对路径 (/开头)
    let relReg = /["'](\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/i;
    let relMatch = data.match(relReg);
    if (relMatch) {
        return domain + relMatch[1];
    }
    return null;
}

function getFakeHeaders(referer) {
    return {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": referer || "https://123av.com/",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9"
    };
}

function handleSuccess(code, m3u8, source) {
    console.log(`\n🎯 [成功获取 M3U8] 数据源: ${source}\n🔗 链接: ${m3u8}\n`);
    let shortcutUrl = `shortcuts://run-shortcut?name=JavPlay&input=text&text=${encodeURIComponent(m3u8)}`;
    let title = `▶ 解析成功 (${source}): ${code.toUpperCase()}`;
    $notification.post(title, `找到流媒体链接`, `点击弹窗立即拉起 SenPlayer`, { url: shortcutUrl });
    $done({ body });
}