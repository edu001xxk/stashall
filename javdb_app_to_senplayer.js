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

    // 【修改点1】将 Jable 请求封装成一个小函数，方便失败时重试 -c 后缀
    function checkJable(targetCode, isRetry) {
        let jableUrl = `https://jable.tv/videos/${targetCode}/`;

        $httpClient.get({
            url: jableUrl,
            headers: getFakeHeaders()
        }, function(error, response, data) {
            let foundM3u8 = false;

            if (!error && response.status === 200) {
                let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
                let m3u8Match = data.match(m3u8Reg);
                if (m3u8Match) {
                    foundM3u8 = true;
                    handleSuccess(code, m3u8Match[0], "Jable");
                }
            }
            
            // 备用方案分流
            if (!foundM3u8) {
                if (!isRetry) {
                    console.log(`[JavDB-SenPlayer] ⚠️ Jable 原番号未找到，尝试中文字幕后缀 (-c)...`);
                    checkJable(`${code}-c`, true); // 自动重试
                } else {
                    console.log(`[JavDB-SenPlayer] ⚠️ Jable 均未找到或被拦截，转去 123AV...`);
                    // 【修改点2】首选尝试 123AV 的真实视频页路径
                    fetch123AV(`https://123av.com/zh/v/${code}`, code, 0);
                }
            }
        });
    }

    // 触发 Jable 请求
    checkJable(code, false);

} else {
    $done({ body });
}

// ==========================================
// 核心：处理 123AV 请求与 CF 盾诊断
// ==========================================
function fetch123AV(url, code, redirectCount) {
    if (redirectCount > 3) {
        console.log(`[JavDB-SenPlayer] ❌ 123AV 重定向次数过多，已停止请求`);
        $done({ body });
        return;
    }
    
    $httpClient.get({
        url: url,
        headers: getFakeHeaders()
    }, function(err, resp, data) {
        if (err) {
            console.log(`[JavDB-SenPlayer] ❌ 123AV 网络请求直接报错: ${err}`);
            $done({ body });
            return;
        }
        
        // 【CF 盾检测】
        if (resp.status === 403 || resp.status === 503) {
            console.log(`[JavDB-SenPlayer] 🛡️ 遭遇 CF 盾拦截！状态码: ${resp.status}，脚本无法绕过此级别防御。`);
            $done({ body });
            return;
        }
        
        // 处理重定向
        if (resp.status === 301 || resp.status === 302 || resp.status === 308) {
            let location = resp.headers['Location'] || resp.headers['location'];
            if (location) {
                if (location.startsWith('/')) {
                    let domain = url.match(/^https?:\/\/[^\/]+/)[0];
                    location = domain + location;
                }
                console.log(`[JavDB-SenPlayer] 🔄 自动跟随重定向至: ${location}`);
                fetch123AV(location, code, redirectCount + 1);
            } else {
                $done({ body });
            }
            return;
        }
        
        // 【修改点3】同时处理 200(成功) 和 404(网页不存在) 的情况，让脚本能够继续尝试其他链接
        if (resp.status === 200 || resp.status === 404) {
            let unescapedData = data ? data.replace(/\\/g, "") : "";
            let m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
            let m3u8Match = unescapedData.match(m3u8Reg);

            if (m3u8Match && resp.status === 200) {
                handleSuccess(code, m3u8Match[0], "123AV");
            } else {
                console.log(`[JavDB-SenPlayer] ⚠️ 123AV 当前路径未找到m3u8，状态码: ${resp.status}`);
                
                // 阶梯式尝试不同的路径
                if (redirectCount === 0) {
                    console.log(`[JavDB-SenPlayer] 尝试使用 123AV 的 -c 后缀...`);
                    fetch123AV(`https://123av.com/zh/v/${code}-c`, code, 1);
                } else if (redirectCount === 1) {
                    console.log(`[JavDB-SenPlayer] 尝试使用 123AV 搜索接口...`);
                    fetch123AV(`https://123av.com/zh/search?q=${code}`, code, 2);
                } else if (redirectCount === 2 && resp.status === 200) {
                    // 如果在搜索列表页，提取详情页链接再进一次
                    let videoLinkReg = new RegExp(`href="([^"]*(?:v|video)[^"]*${code}[^"]*)"`, "i");
                    let linkMatch = unescapedData.match(videoLinkReg);
                    if (linkMatch && linkMatch[1]) {
                        let nextUrl = linkMatch[1].startsWith('/') ? "https://123av.com" + linkMatch[1] : linkMatch[1];
                        console.log(`[JavDB-SenPlayer] 匹配到列表详情页: ${nextUrl}`);
                        fetch123AV(nextUrl, code, 3);
                    } else {
                        $done({ body });
                    }
                } else {
                    $done({ body });
                }
            }
        } else {
            console.log(`[JavDB-SenPlayer] ❌ 未知错误，状态码: ${resp.status}`);
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
// 提取成功后的处理函数（完全保留原样）
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