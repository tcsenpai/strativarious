import { apply, langPicker } from "../i18n.js";
import { $, registerServiceWorker } from "../ui.js";

$("langSlot").append(langPicker());
apply();
registerServiceWorker();

// Respect reduced motion: no autoplaying video, show the poster and controls instead.
if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const v = document.querySelector("video");
  v.removeAttribute("autoplay");
  v.pause();
  v.controls = true;
}
