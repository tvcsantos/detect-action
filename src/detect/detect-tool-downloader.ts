import { ToolDownloader } from '../downloader/tool-downloader'
import * as toolCache from '@actions/tool-cache'
import path from 'path'
import { HttpClient } from 'typed-rest-client/HttpClient'
import { APPLICATION_NAME } from '../action/constants'
import { IHeaders } from 'typed-rest-client/Interfaces'
import { DetectToolsVersions } from './detect-tools-versions'
import { DetectToolVersion } from './detect-tool-version'

// new location since split with Synopsys
const DETECT_BINARY_REPO_URL = 'https://repo.blackduck.com'

// curate the correct URI for the version
const DETECT_URI_BASE = '/bds-integrations-release/com/'
const DETECT_LOCATION_SYNOPSYS = `${DETECT_URI_BASE}synopsys/integration/synopsys-detect`
const DETECT_LOCATION_BLACKDUCK = `${DETECT_URI_BASE}blackduck/integration/detect`

export const TOOL_NAME = 'detect'

export class DetectToolDownloader implements ToolDownloader {
  private AUTH_URI: string
  private DOWNLOAD_URI: string
  private TOOL_NAME_LOCAL: string

  constructor() {
    // assume properties for v9.x or earlier
    this.AUTH_URI = `${DETECT_BINARY_REPO_URL}/api/storage/${DETECT_LOCATION_SYNOPSYS}`
    this.DOWNLOAD_URI = `${DETECT_BINARY_REPO_URL}${DETECT_LOCATION_SYNOPSYS}`
    this.TOOL_NAME_LOCAL = 'synopsys-detect-'
  }

  private setupUris(versionAsNum = 8): undefined {
    if (versionAsNum >= 10) {
      // new location to download versions >= 10
      this.AUTH_URI = `${DETECT_BINARY_REPO_URL}/api/storage/${DETECT_LOCATION_BLACKDUCK}`
      this.DOWNLOAD_URI = `${DETECT_BINARY_REPO_URL}${DETECT_LOCATION_BLACKDUCK}`
      this.TOOL_NAME_LOCAL = 'detect-'
    }
  }

  private async getDetectVersions(): Promise<DetectToolsVersions> {
    const authenticationClient = new HttpClient(APPLICATION_NAME)
    const headers: IHeaders = {
      'X-Result-Detail': 'info'
    }

    const httpClientResponse = await authenticationClient.get(
      `${this.AUTH_URI}?properties`,
      headers
    )
    const responseBody = await httpClientResponse.readBody()
    return JSON.parse(responseBody) as DetectToolsVersions
  }

  private async findDetectVersion(
    version?: string
  ): Promise<DetectToolVersion> {
    // default to 8.x
    let majorVersionAsNum = 8
    if (version?.match(/^[0-9]+/)) {
      majorVersionAsNum = parseInt(version)
    }

    // URIs differ based on version used
    this.setupUris(majorVersionAsNum)

    if (version?.match(/^[0-9]+.[0-9]+.[0-9]+$/)) {
      return {
        url: `${this.DOWNLOAD_URI}/${version}/${this.TOOL_NAME_LOCAL}${version}.jar`,
        version,
        jarName: `${this.TOOL_NAME_LOCAL}${version}.jar`
      }
    }

    let detectVersionKey = 'DETECT_LATEST_'

    if (version?.match(/^[0-9]+/)) {
      detectVersionKey = `DETECT_LATEST_${version}`
    } else if (version) {
      throw new Error(`Invalid input version '${version}'`)
    }

    const detectVersions = await this.getDetectVersions()
    const keys = Object.keys(detectVersions.properties)
    const key = keys.filter(x => x.match(detectVersionKey)).at(-1)
    if (!key) {
      throw new Error(
        `Cannot find matching key ${detectVersionKey} on detect versions!`
      )
    }
    const url = detectVersions.properties[key].at(-1)
    if (!url) {
      throw new Error(`Cannot find url for property ${key} on detect versions!`)
    }

    const jarName = url.substring(url.lastIndexOf('/') + 1)
    const resultVersion = jarName.substring(
      jarName.lastIndexOf('-') + 1,
      jarName.length - 4
    )

    return { url, version: resultVersion, jarName }
  }

  async download(version?: string): Promise<string> {
    const detectVersion = await this.findDetectVersion(version)

    const cachedDetect = toolCache.find(TOOL_NAME, detectVersion.version)
    if (cachedDetect) {
      return path.resolve(cachedDetect, detectVersion.jarName)
    }

    const detectDownloadPath = await toolCache.downloadTool(detectVersion.url)
    const cachedFolder = await toolCache.cacheFile(
      detectDownloadPath,
      detectVersion.jarName,
      TOOL_NAME,
      detectVersion.version
    )

    return path.resolve(cachedFolder, detectVersion.jarName)
  }

  private static instance: DetectToolDownloader | null

  static getInstance(): DetectToolDownloader {
    if (!DetectToolDownloader.instance) {
      DetectToolDownloader.instance = new DetectToolDownloader()
    }
    return DetectToolDownloader.instance
  }
}
