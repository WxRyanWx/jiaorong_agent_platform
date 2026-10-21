import { SM4Encrypt, SM4Decrypt } from './sm4'

export async function pwdEncrypt(value: string) {
  if (value) {
    return SM4Encrypt(value)
  }
  return ''
}

export async function pwdDecrypt(value: string) {
  if (value) {
    return SM4Decrypt(value)
  }
  return ''
}
