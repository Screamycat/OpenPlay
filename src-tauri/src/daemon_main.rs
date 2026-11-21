#[tokio::main]
async fn main() {
    openplay_lib::daemon::run_daemon().await;
}
