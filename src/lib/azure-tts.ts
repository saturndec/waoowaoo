/**
 * Azure TTS服务 - 生成音频和SRT字幕
 */

import * as sdk from 'microsoft-cognitiveservices-speech-sdk'
import { uploadToCOS } from './cos'

const SPEECH_KEY = process.env.AZURE_SPEECH_KEY!
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION!

interface WordBoundaryData {
  text: string
  audioOffset: number // 毫秒
  duration: number    // 毫秒
  wordLength: number
}

interface TTSResult {
  audioUrl: string    // COS URL
  srtContent: string  // SRT字幕内容
  duration: number    // 音频时长(秒)
}

/**
 * 将毫秒转换为SRT时间格式 (HH:MM:SS,mmm)
 */
function msToSRTTime(ms: number): string {
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const milliseconds = Math.floor(ms % 1000)
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`
}

/**
 * 从所有边界数据中提取精确的句子时间
 * 策略:
 * 1. 找到每个SentenceBoundary的开始时间
 * 2. 找到该句子开始后、下一个句子开始前的所有WordBoundary
 * 3. 使用最后一个WordBoundary的结束时间作为句子结束时间
 */
function extractSentencesWithAccurateTiming(
  allBoundaries: Array<{
    text: string
    audioOffset: number
    duration: number
    boundaryType: string
  }>
): WordBoundaryData[] {
  const sentences: WordBoundaryData[] = []

  // 找出所有句子边界
  const sentenceBoundaries = allBoundaries.filter(b => b.boundaryType === 'SentenceBoundary')

  for (let i = 0; i < sentenceBoundaries.length; i++) {
    const sentence = sentenceBoundaries[i]
    const sentenceStartTime = sentence.audioOffset

    // 下一个句子的开始时间(如果没有下一个句子,使用无穷大)
    const nextSentenceStartTime = i < sentenceBoundaries.length - 1
      ? sentenceBoundaries[i + 1].audioOffset
      : Infinity

    // 找到这个句子时间范围内的所有WordBoundary
    const wordsInSentence = allBoundaries.filter(b =>
      b.boundaryType === 'WordBoundary' &&
      b.audioOffset >= sentenceStartTime &&
      b.audioOffset < nextSentenceStartTime
    )

    // 计算句子的精确结束时间
    let sentenceEndTime = sentenceStartTime + sentence.duration // 默认值

    if (wordsInSentence.length > 0) {
      // 使用最后一个词的结束时间
      const lastWord = wordsInSentence[wordsInSentence.length - 1]
      sentenceEndTime = lastWord.audioOffset + lastWord.duration
    }

    sentences.push({
      text: sentence.text,
      audioOffset: sentenceStartTime,
      duration: sentenceEndTime - sentenceStartTime,
      wordLength: sentence.text.length
    })
  }

  return sentences
}

/**
 * 生成SRT字幕内容
 */
function generateSRT(sentences: WordBoundaryData[]): string {
  if (sentences.length === 0) return ''

  const lines: string[] = []

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]
    const startTime = sentence.audioOffset
    const endTime = sentence.audioOffset + sentence.duration

    lines.push(`${i + 1}`)
    lines.push(`${msToSRTTime(startTime)} --> ${msToSRTTime(endTime)}`)
    lines.push(sentence.text)
    lines.push('') // 空行
  }

  return lines.join('\n')
}

/**
 * 预处理文本，确保有合适的句子分段
 * 规则：最小20字，最大35字，在逗号处断句（将逗号改为句号）
 */
function preprocessTextForTTS(text: string): string {
  // 先移除多余的空白，保留换行
  let processed = text.replace(/[ \t]+/g, ' ').trim()
  
  // 如果有换行符，在没有句子结束标点的换行处添加句号
  processed = processed.replace(/([^。？！\n])\n/g, '$1。\n')
  
  // 将文本按句子结束标点分割处理
  const sentenceEnders = /([。？！])/g
  const parts = processed.split(sentenceEnders)
  
  let result = ''
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    // 如果是标点符号，直接添加
    if (/^[。？！]$/.test(part)) {
      result += part
      continue
    }
    
    // 处理长句子：在逗号处断句
    let currentSentence = ''
    let charCount = 0
    
    for (let j = 0; j < part.length; j++) {
      const char = part[j]
      currentSentence += char
      charCount++
      
      // 遇到逗号时检查是否需要断句
      if (char === '，' || char === ',') {
        // 如果已经超过20字，在这里断句
        if (charCount >= 20) {
          // 将逗号替换为句号
          currentSentence = currentSentence.slice(0, -1) + '。'
          result += currentSentence
          currentSentence = ''
          charCount = 0
        }
      }
      
      // 如果超过35字还没断句，强制在下一个逗号断句
      if (charCount > 35 && (char === '，' || char === ',')) {
        currentSentence = currentSentence.slice(0, -1) + '。'
        result += currentSentence
        currentSentence = ''
        charCount = 0
      }
    }
    
    // 添加剩余内容
    result += currentSentence
  }
  
  // 确保文本以句号结尾
  if (result && !/[。？！]$/.test(result)) {
    result += '。'
  }
  
  return result
}

/**
 * 使用Azure TTS生成音频和SRT字幕
 * @param text 要合成的文本
 * @param projectId 项目ID
 * @param voiceName 语音名称
 * @param rate 语速调整，例如 "+50%" 表示加速50%，范围 -50% 到 +100%
 */
export async function generateTTSWithSRT(
  text: string,
  projectId: string,
  voiceName: string = 'zh-CN-YunxiNeural',
  rate: string = '+50%'
): Promise<TTSResult> {
  // 预处理文本，确保有合适的句子分段
  const processedText = preprocessTextForTTS(text)
  console.log(`TTS: Original text length: ${text.length}, Processed text length: ${processedText.length}`)
  
  return new Promise((resolve, reject) => {
    try {
      // 配置Azure Speech
      const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION)
      speechConfig.speechSynthesisVoiceName = voiceName
      speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3
      
      // 启用句子级别的WordBoundary事件
      speechConfig.setProperty(
        sdk.PropertyId.SpeechServiceResponse_RequestSentenceBoundary,
        'true'
      )
      
      // 创建synthesizer (不指定audioConfig,获取内存流)
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, undefined)
      
      // 收集所有WordBoundary数据(包括词和句子边界)
      const allBoundaries: Array<{
        text: string
        audioOffset: number
        duration: number
        boundaryType: string
      }> = []

      synthesizer.wordBoundary = (_s, e) => {
        allBoundaries.push({
          text: e.text,
          audioOffset: (e.audioOffset + 5000) / 10000, // ticks转毫秒
          duration: e.duration / 10000, // ticks转毫秒
          boundaryType: e.boundaryType
        })
      }

      // 构建SSML以支持语速控制
      const ssml = `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
          <voice name="${voiceName}">
            <prosody rate="${rate}">
              ${processedText}
            </prosody>
          </voice>
        </speak>
      `.trim()

      // 开始合成
      synthesizer.speakSsmlAsync(
        ssml,
        async (result) => {
          try {
            if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
              // 获取音频数据
              const audioData = Buffer.from(result.audioData)
              
              // 上传到COS
              const audioKey = `audio/novel-promotion/${projectId}.mp3`
              const audioUrl = await uploadToCOS(audioData, audioKey)

              // 从所有边界数据中提取精确的句子时间
              const sentences = extractSentencesWithAccurateTiming(allBoundaries)

              // 生成SRT
              const srtContent = generateSRT(sentences)
              
              // 计算音频时长
              const duration = result.audioDuration / 10000000 // 转换为秒
              
              synthesizer.close()
              
              resolve({
                audioUrl,
                srtContent,
                duration
              })
            } else {
              synthesizer.close()
              reject(new Error(`TTS failed: ${result.errorDetails}`))
            }
          } catch (error) {
            synthesizer.close()
            reject(error)
          }
        },
        (error) => {
          synthesizer.close()
          reject(new Error(`TTS error: ${error}`))
        }
      )
    } catch (error) {
      reject(error)
    }
  })
}

