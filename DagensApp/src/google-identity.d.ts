interface GoogleCredentialResponse {
  credential: string
}

interface GoogleAccountsId {
  initialize: (configuration: {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
  }) => void
  prompt: () => void
  disableAutoSelect: () => void
}

interface Window {
  google?: {
    accounts: {
      id: GoogleAccountsId
    }
  }
}
