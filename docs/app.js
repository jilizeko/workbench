import { works } from "./registry.js";

const artContainer = document.getElementById("art-container");
const panel = document.getElementById("panel");
const navNext = document.getElementById("nav-next");
const navRandom = document.getElementById("nav-random");
const deepLink = document.getElementById("deep-link");

const orderedWorks = [...works].sort((a, b) => a.order - b.order);
let currentWork = null;
let currentModule = null;

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

  navNext.href = nextWork ? `#/work/${nextWork.slug}` : "#/";
  navRandom.href = randomWork ? `#/work/${randomWork.slug}` : "#/";
  deepLink.href = work ? `#/work/${work.slug}` : "#/";
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
    link.href = `#/work/${work.slug}`;
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
  const hash = window.location.hash || "#/";

  if (hash.startsWith("#/all")) {
    if (currentModule?.destroy) currentModule.destroy();
    currentModule = null;
    currentWork = null;
    renderAllPosts();
    return;
  }

  if (hash.startsWith("#/credits")) {
    if (currentModule?.destroy) currentModule.destroy();
    currentModule = null;
    currentWork = null;
    renderCredits();
    return;
  }

  if (hash.startsWith("#/work/")) {
    const slug = hash.replace("#/work/", "").trim();
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

window.addEventListener("hashchange", route);
route();
