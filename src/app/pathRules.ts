export const within = (dir: string, path: string) => dir === path || dir.startsWith(`${path}/`);
