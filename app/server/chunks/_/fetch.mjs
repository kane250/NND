import { $ as $fetch } from '../nitro/nitro.mjs';

const myFetch = $fetch.create({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
  },
  timeout: 1e4,
  retry: 3
});

export { myFetch as m };
