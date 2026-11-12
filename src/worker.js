// Solves one chunk of pixels; the page splits the image across a pool of these.
import { solveChunk } from "./core/solve.js";

self.onmessage = ({ data: { id, ksObs, A } }) => {
  const c = solveChunk(ksObs, A);
  self.postMessage({ id, c }, [c.buffer]);
};
