const keys = new Set<string>();
const pointer = { x: 0, y: 0, down: false, justPressed: false };

window.addEventListener("keydown", (e) => {
  keys.add(e.key.toLowerCase());
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
});
window.addEventListener("pointermove", (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
});
window.addEventListener("pointerdown", (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.down = true;
  pointer.justPressed = true;
});
window.addEventListener("pointerup", () => {
  pointer.down = false;
});
window.addEventListener("blur", () => {
  keys.clear();
  pointer.down = false;
  pointer.justPressed = false;
});

export const Input = {
  isDown: (k: string): boolean => keys.has(k.toLowerCase()),
  pointer,
  consumePress: (): boolean => {
    const v = pointer.justPressed;
    pointer.justPressed = false;
    return v;
  },
};
