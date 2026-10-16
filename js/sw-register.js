/* Offline support: register the service worker on http(s) pages. */
(function () {
  if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").then(function (r) { window.cueSW = r; }, function () {});
  });
})();
