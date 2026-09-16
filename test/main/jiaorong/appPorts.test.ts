import { describe, expect, it } from 'vitest'
import { listProbePorts } from '../../../src/jiaorong_src/apps/app-scaffold/web/src/lib/appPorts'

describe('listProbePorts', () => {
  it('starts at 8787 and keeps last successful port first', () => {
    expect(listProbePorts(8787, 3)).toEqual([8787, 8788, 8789])
    expect(listProbePorts(8787, 3, 8789)).toEqual([8789, 8787, 8788])
  })
})
