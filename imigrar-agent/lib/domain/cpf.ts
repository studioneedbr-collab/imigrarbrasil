export function isValidCpf(raw: string): boolean {
  const cpf = raw.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

export function extractCpf(text: string): string | undefined {
  const m = text.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
  if (m && isValidCpf(m[0])) return m[0].replace(/\D/g, "");
  return undefined;
}
