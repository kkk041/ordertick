import request from '../utils/request'

export async function loginNhjc(options) {
  return request('/api/auth/login', {
    data: options,
  })
}
