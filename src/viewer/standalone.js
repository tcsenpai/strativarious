// Entry of exported HTML files: the data (images as data: URLs) is inlined in #data.
import { startViewer } from "./viewer.js";

startViewer(JSON.parse(document.getElementById("data").textContent));
