// SM4 加密/解密（依赖 index.html 中加载的全局 Sm4utils）

declare let Sm4utils: new (key: string) => {
  encryptData_ECB: (plaintext: unknown) => string | false
  decryptData_ECB: (ciphertext: unknown) => string | false
}

const SM4_KEY = '43869399C1411A3BE71A99B35123AEFC'

function encrypt(plaintext: unknown, key: string) {
  const sm4 = new Sm4utils(key)
  if (plaintext instanceof Object) {
    plaintext = JSON.stringify(plaintext)
  }
  const encryptData = sm4.encryptData_ECB(plaintext)
  if (!encryptData) {
    return false
  }
  return encryptData
}

function decrypt(ciphertext: unknown, key: string) {
  const sm4 = new Sm4utils(key)
  let decryptData = sm4.decryptData_ECB(ciphertext)
  if (!decryptData) {
    return false
  }
  if (decryptData.charAt(0) === '{' || decryptData.charAt(0) === '[') {
    decryptData = JSON.parse(decryptData)
  }
  return decryptData
}

export function SM4Encrypt(data: unknown) {
  const encryptData = encrypt(data, SM4_KEY)
  if (!encryptData) {
    console.error('数据加密失败')
    return null
  }
  return encryptData
}

export function SM4Decrypt(data: unknown) {
  if (!SM4_KEY) {
    console.error('SM4密钥错误')
    return null
  }
  const decryptData = decrypt(data, SM4_KEY)
  if (!decryptData) {
    console.error('SM4密钥解密失败')
    return null
  }
  return decryptData
}
