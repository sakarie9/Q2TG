export default {
  async upload(data: string) {
    const req = await fetch('https://fars.ee', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        c: data,
      }),
    });
    return req.headers.get('Location');
  },
};
