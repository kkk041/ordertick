import request from '../utils/request'

export async function loginNhjc(options) {
  return request('/api/auth/login', {
    data: options,
  })
}

export async function logoutNhjc(options = {}) {
  return request('/api/auth/loginOut', {
    data: options,
  })
}
