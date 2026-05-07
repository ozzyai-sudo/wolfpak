/**
 * WOLFPAK AI — Polyfills for Node.js < 22
 * Promise.withResolvers is required by libp2p but only available in Node 22+
 */

if (typeof Promise.withResolvers !== 'function') {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
