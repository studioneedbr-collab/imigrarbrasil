/**
 * Política de senha compartilhada entre servidor e navegador.
 *
 * Vive fora de `password.ts` de propósito: aquele módulo importa `node:crypto` e
 * não pode ser puxado por um componente cliente. Aqui só há constantes, então a
 * tela de Usuários e a rota /api/users leem exatamente o mesmo número — antes o
 * formulário exigia 6 caracteres e a API 12, e toda criação com senha curta
 * morria num 400 que parecia "o botão não funciona".
 */
export const MIN_PASSWORD_LENGTH = 12;

export const PASSWORD_RULE_TEXT = `Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`;
