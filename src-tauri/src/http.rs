use std::sync::OnceLock;
use std::time::Duration;

static SHARED_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static HTTP1_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static NO_REDIRECT_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

/// Returns a process-wide pooled `reqwest::Client` so TLS root stores, DNS resolvers,
/// and HTTP keep-alive connection pools are reused across metadata/scanner/update calls
/// instead of allocating a fresh `rustls` config per request.
///
/// Callers with specific timeouts or custom headers should attach them per request via
/// `.timeout(Duration::from_secs(...))` and `.header(...)`.
pub fn client() -> &'static reqwest::Client {
    SHARED_HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(concat!(
                "OpenPlay/",
                env!("CARGO_PKG_VERSION"),
                " (https://github.com/Screamycat/OpenPlay)"
            ))
            .pool_max_idle_per_host(4)
            .pool_idle_timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

/// Returns a shared pooled HTTP/1.1-only `reqwest::Client` (required by Epic Store GraphQL/CDN).
pub fn http1_client() -> &'static reqwest::Client {
    HTTP1_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .http1_only()
            .pool_max_idle_per_host(4)
            .pool_idle_timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

/// Returns a shared pooled `reqwest::Client` that does not follow HTTP redirects
/// (used for Steam AppID / PCGamingWiki redirect probing).
pub fn no_redirect_client() -> &'static reqwest::Client {
    NO_REDIRECT_HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .user_agent("OpenPlay/0.1.4 (https://github.com/Screamycat/OpenPlay)")
            .pool_max_idle_per_host(2)
            .pool_idle_timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}
