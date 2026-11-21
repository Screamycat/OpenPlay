import { BrowserWindow } from "electron";

const activeWindows = new Map<string, BrowserWindow>();

export interface OAuthHelperParams {
  mainWindow?: BrowserWindow | null;
  sendEvent: (event: string, payload: any) => void;
}

export function openOAuthWindow(
  options: {
    provider: string;
    url: string;
    title: string;
    width?: number;
    height?: number;
    userAgent?: string;
    detectFn?: (url: string) => string | null;
    initScript?: string;
    onDetected: (tokenOrId: string) => void;
  },
  parent?: BrowserWindow | null
): BrowserWindow {
  const existing = activeWindows.get(options.provider);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return existing;
  }

  const win = new BrowserWindow({
    width: options.width || 800,
    height: options.height || 660,
    title: options.title,
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (options.userAgent) {
    win.webContents.setUserAgent(options.userAgent);
  }

  activeWindows.set(options.provider, win);

  let captured = false;
  const finish = (result: string) => {
    if (captured) return;
    captured = true;
    options.onDetected(result);
    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.close();
      }
    }, 150);
  };

  const checkUrl = (targetUrl: string) => {
    if (captured) return;
    if (options.detectFn) {
      const extracted = options.detectFn(targetUrl);
      if (extracted) {
        finish(extracted);
      }
    }
  };

  win.webContents.on("will-navigate", (_, newUrl) => checkUrl(newUrl));
  win.webContents.on("did-navigate", (_, newUrl) => checkUrl(newUrl));
  win.webContents.on("will-redirect", (_, newUrl) => checkUrl(newUrl));

  if (options.initScript) {
    win.webContents.on("did-finish-load", () => {
      if (!captured && !win.isDestroyed()) {
        win.webContents.executeJavaScript(options.initScript!).catch(() => {});
      }
    });
  }

  win.on("closed", () => {
    activeWindows.delete(options.provider);
  });

  win.loadURL(options.url);
  return win;
}

export function handleStoreOAuth(providerCmd: string, helper: OAuthHelperParams): boolean {
  switch (providerCmd) {
    case "open_steam_login_window":
      openOAuthWindow(
        {
          provider: "steam",
          title: "Sign In to Steam",
          url: "https://steamcommunity.com/login/home/?goto=",
          detectFn: (urlStr) => {
            if (urlStr.includes("steamcommunity.com/id/") || urlStr.includes("steamcommunity.com/profiles/")) {
              if (urlStr.includes("steamcommunity.com/profiles/")) {
                const rest = urlStr.split("steamcommunity.com/profiles/")[1];
                return rest.split("/")[0] || null;
              } else if (urlStr.includes("steamcommunity.com/id/")) {
                const rest = urlStr.split("steamcommunity.com/id/")[1];
                return rest.split("/")[0] || null;
              }
            }
            return null;
          },
          onDetected: (steamId) => {
            helper.sendEvent("steam-login-detected", steamId);
          },
        },
        helper.mainWindow
      );
      return true;

    case "open_gog_login_window":
      openOAuthWindow(
        {
          provider: "gog",
          title: "Sign In to GOG Galaxy",
          url: "https://auth.gog.com/auth?client_id=46899977096215655&redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient&response_type=code&layout=client2",
          detectFn: (urlStr) => {
            if (urlStr.includes("code=")) {
              const pos = urlStr.indexOf("code=");
              const code = urlStr.slice(pos + 5).split("&")[0];
              return code || null;
            }
            return null;
          },
          onDetected: (code) => {
            helper.sendEvent("gog-code-detected", code);
          },
        },
        helper.mainWindow
      );
      return true;

    case "open_epic_login_window":
      openOAuthWindow(
        {
          provider: "epic",
          title: "Sign In to Epic Games",
          url: "https://www.epicgames.com/id/login?redirectUrl=https%3A%2F%2Fwww.epicgames.com%2Fid%2Fapi%2Fredirect%3FclientId%3D34a02cf8f4414e29b15921876da36f9a%26responseType%3Dcode",
          initScript: `
            (function() {
              function check() {
                try {
                  const text = document.body ? (document.body.innerText || document.body.textContent) : "";
                  if (text && (text.includes("authorizationCode") || text.includes("exchangeCode") || text.includes("sid"))) {
                    const parsed = JSON.parse(text);
                    const code = parsed.authorizationCode || parsed.exchangeCode;
                    if (code && typeof code === 'string' && code.length >= 20) {
                      window.location.href = "https://localhost/openplay_auth?code=" + encodeURIComponent(code);
                    }
                  }
                } catch (e) {}
              }
              setInterval(check, 300);
              check();
            })();
          `,
          detectFn: (urlStr) => {
            if (urlStr.includes("code=")) {
              const pos = urlStr.indexOf("code=");
              const code = decodeURIComponent(urlStr.slice(pos + 5).split("&")[0]);
              if (code && code.length >= 20) return code;
            }
            return null;
          },
          onDetected: (code) => {
            helper.sendEvent("epic-code-detected", code);
          },
        },
        helper.mainWindow
      );
      return true;

    case "open_xbox_login_window":
      openOAuthWindow(
        {
          provider: "xbox",
          title: "Sign In to Xbox Live",
          url: "https://login.live.com/oauth20_authorize.srf?client_id=38cd2fa8-66fd-4760-afb2-405eb65d5b0c&response_type=code&approval_prompt=auto&scope=Xboxlive.signin%20Xboxlive.offline_access&redirect_uri=https://login.live.com/oauth20_desktop.srf",
          detectFn: (urlStr) => {
            if (urlStr.includes("code=")) {
              const pos = urlStr.indexOf("code=");
              return decodeURIComponent(urlStr.slice(pos + 5).split("&")[0]);
            }
            if (urlStr.includes("access_token=")) {
              const pos = urlStr.indexOf("access_token=");
              return decodeURIComponent(urlStr.slice(pos + 13).split("&")[0]);
            }
            return null;
          },
          onDetected: (token) => {
            helper.sendEvent("xbox-token-detected", token);
          },
        },
        helper.mainWindow
      );
      return true;

    case "open_ea_login_window":
      openOAuthWindow(
        {
          provider: "ea",
          title: "Sign In to EA Account",
          url: "https://www.ea.com/login",
          initScript: `
            (function() {
              async function checkEa() {
                try {
                  const href = window.location.href || "";
                  if (href.includes("access_token=")) {
                    const m = href.match(/access_token=([^&]+)/);
                    if (m && m[1]) {
                      window.location.href = "https://localhost/openplay_ea_auth?access_token=" + m[1];
                      return;
                    }
                  }
                  const host = window.location.hostname || "";
                  if (host.endsWith("ea.com") && !href.includes("signin.ea.com") && !href.includes("/login")) {
                    const r = await fetch("https://accounts.ea.com/connect/auth?client_id=ORIGIN_JS_SDK&response_type=token&redirect_uri=nucleus:rest&prompt=none", {
                      credentials: "include"
                    });
                    if (r.ok) {
                      const j = await r.json();
                      if (j && j.access_token) {
                        window.location.href = "https://localhost/openplay_ea_auth?access_token=" + encodeURIComponent(j.access_token);
                      }
                    }
                  }
                } catch (e) {}
              }
              setInterval(checkEa, 700);
              checkEa();
            })();
          `,
          detectFn: (urlStr) => {
            if (urlStr.includes("access_token=")) {
              const pos = urlStr.indexOf("access_token=");
              return decodeURIComponent(urlStr.slice(pos + 13).split("&")[0]);
            }
            return null;
          },
          onDetected: (tok) => {
            helper.sendEvent("ea-token-detected", tok);
          },
        },
        helper.mainWindow
      );
      return true;

    case "open_ubisoft_login_window":
      openOAuthWindow(
        {
          provider: "ubisoft",
          title: "Sign In to Ubisoft Connect",
          width: 480,
          height: 700,
          url: "https://connect.ubisoft.com/login?appId=74e71609-1ddf-47da-9073-71ac3aa8c90c&lang=en-US&nextUrl=https:%2F%2Fconnect.ubisoft.com%2Fready",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          initScript: `
            (function() {
              function extractAndSend(ticket, userId, name) {
                const payload = JSON.stringify({
                  ticket: ticket,
                  userId: userId || "ubisoft_user",
                  name: name || "Ubisoft User"
                });
                window.location.href = "https://localhost/openplay_ubi_auth?payload=" + encodeURIComponent(payload);
              }
              function checkStorage() {
                try {
                  for (const storage of [window.localStorage, window.sessionStorage]) {
                    if (!storage) continue;
                    const direct = storage.getItem("PRODloginData") || storage.getItem("loginData") || storage.getItem("PRODrememberMeToken");
                    if (direct) {
                      try {
                        const parsed = JSON.parse(direct);
                        const t = parsed.ticket || parsed.rememberMeTicket;
                        if (t) {
                          extractAndSend(t, parsed.userId || parsed.profileId, parsed.nameOnPlatform || parsed.username);
                          return;
                        }
                      } catch (_) {}
                    }
                  }
                } catch (e) {}
              }
              setInterval(checkStorage, 400);
              checkStorage();
            })();
          `,
          detectFn: (urlStr) => {
            if (urlStr.includes("openplay_ubi_auth?payload=")) {
              const pos = urlStr.indexOf("payload=");
              return decodeURIComponent(urlStr.slice(pos + 8).split("&")[0]);
            }
            return null;
          },
          onDetected: (payload) => {
            helper.sendEvent("ubisoft-ticket-detected", payload);
          },
        },
        helper.mainWindow
      );
      return true;

    case "open_battlenet_login_window":
      openOAuthWindow(
        {
          provider: "battlenet",
          title: "Sign In to Battle.net",
          url: "https://account.battle.net/overview",
          initScript: `
            (function() {
              async function checkBnet() {
                try {
                  const host = window.location.hostname || "";
                  const path = window.location.pathname || "";
                  if (host.includes("account.battle.net") && !path.includes("login")) {
                    const r1 = await fetch("https://account.battle.net/api/games-and-subs", {
                      headers: { "Accept": "application/json" },
                      credentials: "include"
                    });
                    if (!r1.ok) return;
                    const gamesAndSubs = await r1.json();
                    if (!gamesAndSubs || !Array.isArray(gamesAndSubs.gameAccounts)) return;

                    let classicGames = [];
                    try {
                      const r2 = await fetch("https://account.battle.net/api/classic-games", {
                        headers: { "Accept": "application/json" },
                        credentials: "include"
                      });
                      if (r2.ok) {
                        const cj = await r2.json();
                        if (cj && Array.isArray(cj.classicGames)) {
                          classicGames = cj.classicGames;
                        }
                      }
                    } catch (e) {}

                    let battleTag = "Battle.net User";
                    try {
                      const r3 = await fetch("https://account.battle.net/api/overview", {
                        headers: { "Accept": "application/json" },
                        credentials: "include"
                      });
                      if (r3.ok) {
                        const oj = await r3.json();
                        battleTag = (oj && oj.accountDetails && (oj.accountDetails.battleTag || oj.accountDetails.email)) || battleTag;
                      }
                    } catch (e) {}

                    const payload = JSON.stringify({
                      battleTag: battleTag,
                      gameAccounts: gamesAndSubs.gameAccounts,
                      classicGames: classicGames
                    });
                    window.location.href = "https://localhost/openplay_bnet_auth?payload=" + encodeURIComponent(payload);
                  }
                } catch (e) {}
              }
              setInterval(checkBnet, 600);
              checkBnet();
            })();
          `,
          detectFn: (urlStr) => {
            if (urlStr.includes("openplay_bnet_auth?payload=")) {
              const pos = urlStr.indexOf("payload=");
              return decodeURIComponent(urlStr.slice(pos + 8).split("&")[0]);
            }
            return null;
          },
          onDetected: (payload) => {
            helper.sendEvent("battlenet-payload-detected", payload);
          },
        },
        helper.mainWindow
      );
      return true;

    case "open_amazon_login_window":
      openOAuthWindow(
        {
          provider: "amazon",
          title: "Sign In to Amazon Games",
          url: "https://www.amazon.com/ap/oa?client_id=device%3A32323532383134373033333333353535&scope=amazon_auth&response_type=code&redirect_uri=https%3A%2F%2Fwww.amazon.com",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) @amzn/aga-electron-platform/1.0.0 Chrome/78.0.3904.130 Electron/7.1.9 Safari/537.36",
          detectFn: (urlStr) => {
            if (urlStr.includes("openid.oa2.authorization_code=")) {
              const pos = urlStr.indexOf("openid.oa2.authorization_code=");
              return decodeURIComponent(urlStr.slice(pos + 30).split("&")[0]);
            }
            return null;
          },
          onDetected: (code) => {
            helper.sendEvent("amazon-code-detected", code);
          },
        },
        helper.mainWindow
      );
      return true;

    default:
      return false;
  }
}
