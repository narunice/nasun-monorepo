/// <reference types="vite/client" />

type SuiID = {
  id: string
}

interface ImportMetaEnv {
  readonly VITE_WORDPRESS_DOMAIN: string
}
