type Fn<T> = () => Promise<T>;

const limit = 3;

export class RequestQueue {
  private queue: {
    fn: Fn<any>;
    resolve: (value: any) => void;
    reject: (err: any) => void;
  }[] = [];

  private running = 0;

  push<T>(fn: Fn<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.running === limit || this.queue.length === 0) {
      return;
    }

    const current = this.queue[0];

    this.running++;

    current
      .fn()
      .then((result) => current.resolve(result))
      .catch((err) => current.reject(err))
      .finally(() => {
        this.running--;
        this.queue.shift();
        this.processQueue();
      });
  }

  get length(): number {
    return this.queue.length;
  }
}
