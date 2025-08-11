type Fn<T> = () => Promise<T>;

export class RequestQueue {
  private queue: {
    fn: Fn<any>;
    resolve: (value: any) => void;
    reject: (err: any) => void;
  }[] = [];

  private running = false;

  push<T>(fn: Fn<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      if (!this.running) {
        this.running = true;
        void this.runNext();
      }
    });
  }

  private async runNext(): Promise<void> {
    while (this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue[0];
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      }
      this.queue.shift();
    }
    this.running = false;
  }

  get length(): number {
    return this.queue.length;
  }
}
