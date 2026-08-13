interface GoogleCredentialResponse {
  credential: string
}

interface GoogleAccountsId {
  initialize: (configuration: {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
  }) => void
  renderButton: (
    parent: HTMLElement,
    options: { theme: 'outline'; size: 'large'; text: 'signin_with' },
  ) => void
  disableAutoSelect: () => void
}

interface Window {
  google?: {
    accounts: {
      id: GoogleAccountsId
    }
  }
}
