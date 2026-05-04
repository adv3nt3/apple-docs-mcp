import { convertToJsonApiUrl, isValidAppleDeveloperUrl } from '../utils/url-converter.js';
import { httpClient } from '../utils/http-client.js';
import { logger } from '../utils/logger.js';
import { PROCESSING_LIMITS } from '../utils/constants.js';
import { appError, ErrorType } from '../utils/error-handler.js';

/**
 * 平台兼容性信息接口
 */
interface PlatformInfo {
  name: string;
  introducedAt?: string;
  deprecatedAt?: string;
  obsoletedAt?: string;
  beta?: boolean;
  deprecated?: boolean;
  unavailable?: boolean;
  message?: string;
}

interface CompatibilityAnalysis {
  apiName: string;
  apiUrl: string;
  platforms: PlatformInfo[];
  supportedPlatforms: string[];
  betaPlatforms: string[];
  deprecatedPlatforms: string[];
  minVersions: Record<string, string>;
  crossPlatformSupport: boolean;
}

interface AppleDocData {
  metadata?: {
    title?: string;
    platforms?: PlatformInfo[];
    symbolKind?: string;
    role?: string;
  };
  topicSections?: Array<{
    title: string;
    identifiers: string[];
  }>;
  references?: Record<string, any>;
}

/**
 * 获取平台兼容性分析
 */
export async function handleGetPlatformCompatibility(
  apiUrl: string,
  compareMode: string = 'single',
  includeRelated: boolean = false,
): Promise<string> {
  if (!isValidAppleDeveloperUrl(apiUrl)) {
    throw appError(ErrorType.INVALID_INPUT, 'URL must be from developer.apple.com');
  }
  try {
    logger.info(`Analyzing platform compatibility for: ${apiUrl}`);

    if (compareMode === 'framework') {
      return await analyzeFrameworkCompatibility(apiUrl, includeRelated);
    } else {
      return await analyzeSingleApiCompatibility(apiUrl, includeRelated);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Error: Failed to analyze platform compatibility: ${errorMessage}`;
  }
}

/**
 * 分析单个API的平台兼容性
 */
async function analyzeSingleApiCompatibility(
  apiUrl: string,
  includeRelated: boolean,
): Promise<string> {
  const jsonApiUrl = convertToJsonApiUrl(apiUrl);

  if (!jsonApiUrl) {
    throw new Error('Invalid Apple Developer Documentation URL');
  }

  const data = await httpClient.getJson<AppleDocData>(jsonApiUrl);

  if (!data.metadata?.platforms) {
    return `No platform information available for: ${apiUrl}`;
  }

  const analysis = analyzeCompatibility(
    data.metadata.title || 'Unknown API',
    apiUrl,
    data.metadata.platforms,
  );

  let result = formatCompatibilityAnalysis(analysis);

  // 如果需要包含相关API的兼容性信息
  if (includeRelated && data.topicSections) {
    const relatedAnalyses = await analyzeRelatedCompatibility(data, 3); // 限制3个相关API
    if (relatedAnalyses.length > 0) {
      result += '\n\n## Related APIs Compatibility\n\n';
      for (const relatedAnalysis of relatedAnalyses) {
        result += formatCompatibilityAnalysis(relatedAnalysis, true) + '\n';
      }
    }
  }

  return result;
}

/**
 * 分析框架的平台兼容性
 */
async function analyzeFrameworkCompatibility(
  frameworkUrl: string,
  includeRelated: boolean,
): Promise<string> {
  // 这里可以扩展为分析整个框架的兼容性
  // 暂时使用单API分析作为基础
  return await analyzeSingleApiCompatibility(frameworkUrl, includeRelated || true);
}

/**
 * 分析相关API的兼容性
 */
async function analyzeRelatedCompatibility(
  data: AppleDocData,
  maxRelated: number = 3,
): Promise<CompatibilityAnalysis[]> {
  const analyses: CompatibilityAnalysis[] = [];

  if (!data.topicSections || !data.references) {
    return analyses;
  }

  let count = 0;
  for (const section of data.topicSections) {
    if (count >= maxRelated) {
      break;
    }

    for (const identifier of section.identifiers.slice(0, PROCESSING_LIMITS.MAX_PLATFORM_COMPATIBILITY_ITEMS)) { // 每个section最多2个
      if (count >= maxRelated) {
        break;
      }

      const ref = data.references[identifier];
      if (ref?.url) {
        try {
          const relatedUrl = `https://developer.apple.com${ref.url}`;
          const relatedJsonUrl = convertToJsonApiUrl(relatedUrl);

          if (!relatedJsonUrl) {
            logger.warn(`Failed to convert URL: ${relatedUrl}`);
            continue;
          }

          const relatedData = await httpClient.getJson<AppleDocData>(relatedJsonUrl);
          if (relatedData.metadata?.platforms) {
            const analysis = analyzeCompatibility(
              ref.title || 'Unknown',
              relatedUrl,
              relatedData.metadata.platforms,
            );
            analyses.push(analysis);
            count++;
          }
        } catch (error) {
          // 忽略单个相关API的错误
          logger.error(`Failed to fetch related API ${identifier}:`, error);
        }
      }
    }
  }

  return analyses;
}

/**
 * 分析兼容性数据
 */
function analyzeCompatibility(
  apiName: string,
  apiUrl: string,
  platforms: PlatformInfo[],
): CompatibilityAnalysis {
  const supportedPlatforms: string[] = [];
  const betaPlatforms: string[] = [];
  const deprecatedPlatforms: string[] = [];
  const minVersions: Record<string, string> = {};

  for (const platform of platforms) {
    supportedPlatforms.push(platform.name);

    if (platform.beta) {
      betaPlatforms.push(platform.name);
    }

    if (platform.deprecated) {
      deprecatedPlatforms.push(platform.name);
    }

    if (platform.introducedAt) {
      minVersions[platform.name] = platform.introducedAt;
    }
  }

  return {
    apiName,
    apiUrl,
    platforms,
    supportedPlatforms,
    betaPlatforms,
    deprecatedPlatforms,
    minVersions,
    crossPlatformSupport: supportedPlatforms.length > 1,
  };
}



/**
 * 格式化兼容性分析结果
 */
function formatCompatibilityAnalysis(analysis: CompatibilityAnalysis, isRelated: boolean = false): string {
  const prefix = isRelated ? '### ' : '# ';
  let content = `${prefix}Platform Compatibility: ${analysis.apiName}\n\n`;

  if (!isRelated) {
    content += `**API:** [${analysis.apiUrl}](${analysis.apiUrl})\n\n`;
  }

  // 平台支持概览
  content += '## Platform Support Summary\n\n';
  content += `**Supported Platforms:** ${analysis.supportedPlatforms.join(', ')}\n`;
  content += `**Cross-Platform:** ${analysis.crossPlatformSupport ? 'Yes' : 'No'}\n`;

  if (analysis.betaPlatforms.length > 0) {
    content += `**Beta Platforms:** ${analysis.betaPlatforms.join(', ')}\n`;
  }

  if (analysis.deprecatedPlatforms.length > 0) {
    content += `**Deprecated Platforms:** ${analysis.deprecatedPlatforms.join(', ')}\n`;
  }

  content += '\n';

  // 详细平台信息
  content += '## Detailed Platform Information\n\n';

  for (const platform of analysis.platforms) {
    content += `**${platform.name}**\n`;

    if (platform.introducedAt) {
      content += `- Introduced: ${platform.introducedAt}\n`;
    }

    if (platform.deprecatedAt) {
      content += `- Deprecated: ${platform.deprecatedAt}\n`;
    }

    if (platform.obsoletedAt) {
      content += `- Obsoleted: ${platform.obsoletedAt}\n`;
    }

    const status = [];
    if (platform.beta) {
      status.push('Beta');
    }
    if (platform.deprecated) {
      status.push('Deprecated');
    }
    if (platform.unavailable) {
      status.push('Unavailable');
    }

    if (status.length > 0) {
      content += `- Status: ${status.join(', ')}\n`;
    }

    if (platform.message) {
      content += `- Note: ${platform.message}\n`;
    }

    content += '\n';
  }

  // 兼容性建议
  content += '## Compatibility Recommendations\n\n';

  if (analysis.crossPlatformSupport) {
    content += `✅ **Cross-platform compatible** - This API works across ${analysis.supportedPlatforms.length} platforms\n\n`;
  } else {
    content += `⚠️ **Platform-specific** - This API is only available on ${analysis.supportedPlatforms[0]}\n\n`;
  }

  if (analysis.betaPlatforms.length > 0) {
    content += '🚧 **Beta platforms** - Some platforms are in beta, expect changes\n\n';
  }

  if (analysis.deprecatedPlatforms.length > 0) {
    content += '⚠️ **Deprecated platforms** - Consider migration plans for deprecated platforms\n\n';
  }

  // 最低版本要求
  if (Object.keys(analysis.minVersions).length > 0) {
    content += '## Minimum Version Requirements\n\n';
    for (const [platform, version] of Object.entries(analysis.minVersions)) {
      content += `- **${platform}:** ${version}+\n`;
    }
    content += '\n';
  }

  return content;
}