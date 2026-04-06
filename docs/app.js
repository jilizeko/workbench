import { works } from "./registry.js";

const artContainer = document.getElementById("art-container");
const panel = document.getElementById("panel");
const navCredits = document.getElementById("nav-credits");
const navAll = document.getElementById("nav-all");
const navNext = document.getElementById("nav-next");
const navRandom = document.getElementById("nav-random");
const deepLink = document.getElementById("deep-link");

const orderedWorks = [...works].sort((a, b) => b.order - a.order);
let currentWork = null;
let currentModule = null;

const basePath = getBasePath();

function getBasePath() {
  const path = window.location.pathname;
  const markers = ["/works/", "/all/", "/credits/"];

  for (const marker of markers) {
    const index = path.indexOf(marker);
    if (index !== -1) {
      return path.slice(0, index + 1);
    }
  }

  if (path.endsWith("/index.html")) {
    return path.slice(0, path.lastIndexOf("/") + 1);
  }

  if (path.endsWith("/")) {
    return path;
  }

  return path.slice(0, path.lastIndexOf("/") + 1);
}

function withBase(relativePath) {
  if (!relativePath) return basePath;
  return `${basePath}${relativePath}`;
}

function getHomeUrl() {
  return withBase("");
}

function getAllUrl() {
  return withBase("all/");
}

function getCreditsUrl() {
  return withBase("credits/");
}

function getWorkUrl(slug) {
  return withBase(`works/${slug}.html`);
}

function getRoutePath() {
  let path = window.location.pathname;

  if (path.startsWith(basePath)) {
    path = `/${path.slice(basePath.length)}`;
  }

  if (path === "/" || path === "/index.html") {
    return "/";
  }

  if (path.endsWith("/index.html")) {
    return path.replace(/\/index\.html$/, "/");
  }

  return path;
}

function getWorkBySlug(slug) {
  return orderedWorks.find((work) => work.slug === slug) || null;
}

function getNextWork(work) {
  if (!work) return orderedWorks[0] || null;
  const index = orderedWorks.findIndex((item) => item.slug === work.slug);
  if (index === -1) return orderedWorks[0] || null;
  return orderedWorks[(index + 1) % orderedWorks.length];
}

function getRandomWork(work) {
  if (orderedWorks.length === 0) return null;
  if (orderedWorks.length === 1) return orderedWorks[0];

  let candidate = null;
  do {
    const index = Math.floor(Math.random() * orderedWorks.length);
    candidate = orderedWorks[index];
  } while (candidate.slug === work?.slug);

  return candidate;
}

function updateNav(work) {
  const nextWork = getNextWork(work);
  const randomWork = getRandomWork(work);

  navNext.href = nextWork ? getWorkUrl(nextWork.slug) : getHomeUrl();
  navRandom.href = randomWork ? getWorkUrl(randomWork.slug) : getHomeUrl();
  deepLink.href = work ? getWorkUrl(work.slug) : getHomeUrl();
}

function clearPanel() {
  panel.innerHTML = "";
  panel.hidden = true;
}

function showPanel() {
  panel.hidden = false;
  artContainer.hidden = true;
}

function showArt() {
  panel.hidden = true;
  artContainer.hidden = false;
}

function renderAllPosts() {
  panel.innerHTML = "";
  orderedWorks.forEach((work) => {
    const link = document.createElement("a");
    link.href = getWorkUrl(work.slug);
    link.textContent = work.title;
    panel.appendChild(link);
  });
  showPanel();
  updateNav(null);
}

function renderCredits() {
  panel.innerHTML = "";
  const lines = [
    "author: genarttable studio",
    "tech: html, css, js, canvas, webgl",
    "contact: hello@genarttable.local",
    "links: https://github.com/genarttable"
  ];

  lines.forEach((text) => {
    const line = document.createElement("div");
    line.textContent = text;
    panel.appendChild(line);
  });

  showPanel();
  updateNav(null);
}

async function loadWork(work) {
  if (!work) return;

  if (currentModule?.destroy) {
    currentModule.destroy();
  }

  artContainer.innerHTML = "";
  showArt();

  try {
    const module = await import(work.script);
    currentModule = module;
    currentWork = work;

    if (module.init) {
      module.init({ container: artContainer, work });
    }

    if (module.start) {
      module.start();
    }

    updateNav(work);
  } catch (error) {
    console.error("Failed to load work", error);
    panel.innerHTML = "";
    const message = document.createElement("div");
    message.textContent = "Failed to load work.";
    panel.appendChild(message);
    showPanel();
  }
}

function route() {
  const path = getRoutePath();

  if (path.startsWith("/all")) {
    if (currentModule?.destroy) currentModule.destroy();
    currentModule = null;
    currentWork = null;
    renderAllPosts();
    return;
  }

  if (path.startsWith("/credits")) {
    if (currentModule?.destroy) currentModule.destroy();
    currentModule = null;
    currentWork = null;
    renderCredits();
    return;
  }

  if (path.startsWith("/works/")) {
    const slug = path.replace("/works/", "").replace(".html", "").trim();
    const work = getWorkBySlug(slug);
    if (work) {
      clearPanel();
      loadWork(work);
      return;
    }
  }

  const defaultWork = orderedWorks[0] || null;
  if (defaultWork) {
    clearPanel();
    loadWork(defaultWork);
  } else {
    renderAllPosts();
  }
}

function handleLinkClick(event) {
  const link = event.target.closest("a");
  if (!link) return;
  if (link.target || link.hasAttribute("download")) return;
  if (event.defaultPrevented) return;
  if (event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const url = new URL(link.href, window.location.origin);
  if (url.origin !== window.location.origin) return;
  if (!url.pathname.startsWith(basePath)) return;

  event.preventDefault();
  window.history.pushState({}, "", url.pathname);
  route();
}

function initNavigation() {
  navCredits.href = getCreditsUrl();
  navAll.href = getAllUrl();
}

window.addEventListener("popstate", route);
document.addEventListener("click", handleLinkClick);
initNavigation();
route();

/* ── Fullscreen ── */
const fsBtn = document.getElementById("fullscreen-btn");
const fsExpand = document.getElementById("fs-expand");
const fsCompress = document.getElementById("fs-compress");
const shell = document.getElementById("shell");
let fsHideTimer = null;

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function updateFsIcon() {
  const fs = isFullscreen();
  fsExpand.style.display = fs ? "none" : "";
  fsCompress.style.display = fs ? "" : "none";
}

function showFsBtn() {
  fsBtn.classList.remove("hidden");
  clearTimeout(fsHideTimer);
  if (isFullscreen()) {
    fsHideTimer = setTimeout(() => fsBtn.classList.add("hidden"), 2000);
  }
}

function onFsActivity() {
  if (isFullscreen()) showFsBtn();
}

fsBtn.addEventListener("click", () => {
  if (isFullscreen()) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    (shell.requestFullscreen || shell.webkitRequestFullscreen).call(shell);
  }
});

document.addEventListener("fullscreenchange", () => {
  updateFsIcon();
  if (isFullscreen()) {
    showFsBtn();
  } else {
    clearTimeout(fsHideTimer);
    fsBtn.classList.remove("hidden");
  }
});
document.addEventListener("webkitfullscreenchange", () => {
  document.dispatchEvent(new Event("fullscreenchange"));
});

/* Notify art modules when the container actually changes size */
new ResizeObserver(() => {
  window.dispatchEvent(new Event("resize"));
}).observe(artContainer);

document.addEventListener("mousemove", onFsActivity);
document.addEventListener("pointerdown", onFsActivity);
document.addEventListener("keydown", onFsActivity);
