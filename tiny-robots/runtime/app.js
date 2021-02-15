// TODO: handle errors

const manifestUrl = "/assets/manifest.json";
const devAppRoute = "/routes/_app.svelte.js";

let lastPendingId;
let pendingIdCtr = 0;

let cachedManifest;
async function manifest() {
  if (cachedManifest) return cachedManifest;
  cachedManifest = await (await fetch(manifestUrl)).json();
  return cachedManifest;
}

export function start({ root, dev }) {
  async function navigate(url, push) {
    const isTrailingSlash = url.pathname[url.pathname.length - 1] === "/";
    const pathname =
      (isTrailingSlash ? url.pathname.slice(0, -1) : url.pathname) || "/";
    const fileName = isTrailingSlash ? url.pathname + "index" : url.pathname;

    const id = pendingIdCtr++;
    lastPendingId = id;

    if (!dev) {
      if (push) history.pushState({}, undefined, url.pathname);
      const entry = (await manifest())[pathname];
      if (lastPendingId !== id) {
        return;
      }
      if (entry) {
        const m = await import(entry.js);
        if (lastPendingId !== id) {
          return;
        }

        const { routeProps, page: pageModule } = m;

        // if (push) {
        //   history.replaceState({ prefetchedProps }, undefined, pathname);
        // }

        update(root, pageModule, routeProps(), id);
        return true;
      }
    } else {
      await devNavigate({ root, pathname, push, fileName, id });

      return true;
    }
  }

  addEventListener("popstate", (e) => {
    navigate(new URL(document.location));
  });

  addEventListener("click", async (e) => {
    // TODO: check if click came from an A tag somehow
    if (!e.target.href) return;
    const url = new URL(e.target.href);
    if (url.origin === document.location.origin) {
      const nagvigated = navigate(url, true);
      if (nagvigated) {
        e.preventDefault();
      }
    }
  });

  if (!dev) {
    manifest();
  }
}

async function devNavigate({ root, pathname, push, fileName, id }) {
  if (push) history.pushState({}, undefined, pathname);
  const pathdir = pathname.split("/").slice(0, -1).join("/");

  root.$set({
    loading: true,
  });

  const [pageModule, layoutModule, appModule] = await Promise.all([
    import("/routes" + fileName + ".svelte.js"),
    import(
      "/routes" + pathdir + "/" + "_layout" + ".svelte.js"
    ).catch(() => {}),
    import(devAppRoute).catch(() => {}),
  ]);

  if (lastPendingId !== id) {
    return;
  }

  const Page = pageModule.default;

  const componentProps = {
    pageComponent: Page,
    layoutComponent: layoutModule ? layoutModule.default : undefined,
    appComponent: appModule ? appModule.default : undefined,
  };

  update(root, pageModule, componentProps, id);
}

async function update(root, { eager, prefetch }, componentProps, id) {
  if (eager) {
    root.$set({
      ...(eager ? componentProps : {}),
      fetching: true,
    });
  }

  let prefetchedProps = {};

  if (prefetch) {
    prefetchedProps = await prefetch();
  }

  if (lastPendingId !== id) {
    return;
  }

  // if (push) history.replaceState({ prefetchedProps }, undefined, pathname);
  root.$set({
    ...(eager ? {} : componentProps),
    fetching: false,
    pageProps: prefetchedProps,
  });
}