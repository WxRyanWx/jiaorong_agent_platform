import { describe, expect, it } from 'vitest'
import * as brand from '@jiaorong/brand'

describe('@jiaorong/brand barrel', () => {
  it('does not re-export appIdentity (fs must stay out of the renderer bundle)', () => {
    expect('APP_HOME_DIR_NAME' in brand).toBe(false)
    expect('migrateLegacyAppHomeDir' in brand).toBe(false)
    expect(brand.APP_NAME).toBe('JiaorongAI')
  })
})
