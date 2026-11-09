export function isAppNavigationAllowed(target: string, appPage: URL, devServerUrl: string | undefined): boolean {
  let url: URL;
  try { url = new URL(target); }
  catch { return false; }
  if (url.username || url.password) return false;
  if (devServerUrl) {
    let devServer: URL;
    try { devServer = new URL(devServerUrl); }
    catch { return false; }
    return url.origin === devServer.origin;
  }
  return url.protocol === 'file:'
    && url.host === appPage.host
    && url.search === ''
    && decodeURIComponent(url.pathname) === decodeURIComponent(appPage.pathname);
}

export function isWidgetMediaAllowed(permission: string, isWidget: boolean): boolean {
  return isWidget && permission === 'media';
}
