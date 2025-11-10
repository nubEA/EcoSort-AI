"use client"

import { useState, useRef } from "react"
import { motion } from "framer-motion"
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts"
import { TrendingUp, Recycle, Zap } from "lucide-react"

// --- Helper function to convert File to Base64 ---
const fileToGenerativePart = async (file) => {
  const base64EncodedDataPromise = new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result.split(",")[1])
    reader.readAsDataURL(file)
  })
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  }
}

// --- Main App Component ---
export default function WasteAnalyzerPage() {
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState("")
  const [analysisResult, setAnalysisResult] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const fileInputRef = useRef(null)

  // --- Image Handling ---
  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
      setAnalysisResult(null) // Clear all previous results
      setError("")
    }
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  // --- Gemini API Call ---
  const handleAnalyze = async () => {
    if (!imageFile) {
      setError("Please upload an image first.")
      return
    }

    setIsLoading(true)
    setError("")
    setAnalysisResult(null)

    try {
      const apiKey = "" // API key will be injected by the runtime
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`

      const imagePart = await fileToGenerativePart(imageFile)

      const systemPrompt =
        "You are a waste management expert. Analyze the user's image of a waste item. First, identify the waste type, home treatment, and industry treatment for the item in the image. " +
        "In *addition* to identifying the item, you must *also* generate a complete set of *mock dashboard data* (stats, charts) to simulate a full user profile. " +
        "The identified item (waste_type, etc.) should be based on the image, but all other dashboard data should be plausibly fabricated. " +
        "Ensure the generated hex colors are distinct and aesthetically pleasing in a dark mode UI. " +
        "Respond *only* with the complete JSON object requested."

      const userQuery = "Analyze this image and provide waste treatment information and mock dashboard data."

      // Define the new, expanded schema
      const schema = {
        type: "OBJECT",
        properties: {
          // --- Part 1: Item-specific analysis ---
          waste_type: {
            type: "STRING",
            description:
              "The common name of the waste item in the image (e.g., 'Plastic Water Bottle', 'Apple Core').",
          },
          home_treatment: {
            type: "STRING",
            description: "Concise instructions for how a person should dispose of this item at home.",
          },
          industry_treatment: {
            type: "STRING",
            description: "A brief explanation of what happens to this item at an industrial/municipal level.",
          },

          // --- Part 2: Mock Dashboard Stats ---
          stats: {
            type: "OBJECT",
            description: "A set of mock statistics for the user's dashboard.",
            properties: {
              recycled_items_count: {
                type: "NUMBER",
                description: "A mock count of total items recycled by this user (e.g., 2847).",
              },
              carbon_saved_kg: {
                type: "STRING",
                description: "A mock string representing total carbon saved, including units (e.g., '284 kg').",
              },
              average_score_percent: {
                type: "STRING",
                description: "A mock user 'eco-score' as a percentage string (e.g., '87%').",
              },
            },
          },

          // --- Part 3: Mock Pie Chart Data ---
          waste_composition: {
            type: "ARRAY",
            description: "An array of 5 objects representing the user's mock waste composition for a pie chart.",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING", description: "Category of waste (e.g., 'Plastic')." },
                value: { type: "NUMBER", description: "Percentage value (e.g., 35)." },
                color: {
                  type: "STRING",
                  description: "A hex color code for the chart slice (e.g., '#e78a53').",
                },
              },
            },
          },

          // --- Part 4: Mock Area Chart Data ---
          disposal_trends: {
            type: "ARRAY",
            description: "An array of 6 objects for the last 6 months' disposal trends.",
            items: {
              type: "OBJECT",
              properties: {
                month: { type: "STRING", description: "Abbreviated month name (e.g., 'Jan')." },
                home: { type: "NUMBER", description: "Mock 'Home' disposal value for the month." },
                industrial: { type: "NUMBER", description: "Mock 'Industrial' disposal value for the month." },
              },
            },
          },

          // --- Part 5: Mock Bar Chart Data ---
          recycling_rates: {
            type: "ARRAY",
            description: "An array of 5 objects representing mock recycling rates per category for a bar chart.",
            items: {
              type: "OBJECT",
              properties: {
                category: { type: "STRING", description: "Waste category (e.g., 'Plastic')." },
                rate: { type: "NUMBER", description: "Recycling rate percentage (e.g., 68)." },
              },
            },
          },
        },
        // Define all required fields
        required: [
          "waste_type",
          "home_treatment",
          "industry_treatment",
          "stats",
          "waste_composition",
          "disposal_trends",
          "recycling_rates",
        ],
      }

      const payload = {
        contents: [
          {
            role: "user",
            parts: [{ text: userQuery }, imagePart],
          },
        ],
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      }

      // --- API Fetch with Retry Logic ---
      let response
      let retries = 3
      let delay = 1000

      while (retries > 0) {
        try {
          response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })

          if (response.ok) {
            break // Success
          }

          if (response.status === 429 || response.status >= 500) {
            // Throttling or server error, wait and retry
            await new Promise((resolve) => setTimeout(resolve, delay))
            delay *= 2 // Exponential backoff
            retries--
          } else {
            // Client error, don't retry
            throw new Error(`APIError: ${response.status} ${response.statusText}`)
          }
        } catch (err) {
          if (retries === 1) throw err // Rethrow last error
          await new Promise((resolve) => setTimeout(resolve, delay))
          delay *= 2
          retries--
        }
      }

      if (!response.ok) {
        throw new Error(`Failed to analyze image after retries: ${response.statusText}`)
      }

      const result = await response.json()
      const candidate = result.candidates?.[0]

      if (candidate && candidate.content?.parts?.[0]?.text) {
        const jsonText = candidate.content.parts[0].text
        const parsedJson = JSON.parse(jsonText)
        setAnalysisResult(parsedJson) // Set the entire dashboard data
      } else {
        throw new Error("Invalid response structure from API.")
      }
    } catch (err) {
      console.error("Gemini API error:", err)
      setError(`Failed to analyze image. ${err.message}. Please try again.`)
    } finally {
      setIsLoading(false)
    }
  }

  // --- Render ---
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 font-['Inter',_sans-serif] text-white overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-black to-zinc-900" />

      {/* Decorative elements */}
      <div className="absolute top-20 right-20 w-72 h-72 bg-[#e78a53]/10 rounded-full blur-3xl opacity-50" />
      <div className="absolute bottom-20 left-20 w-96 h-96 bg-[#e78a53]/5 rounded-full blur-3xl opacity-50" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-6xl"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block mb-6">
            <div className="flex items-center justify-center space-x-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-[#e78a53] w-10 h-10"
              >
                <path
                  fillRule="evenodd"
                  d="M14.25 5.25a3 3 0 0 0-3 3v.105A3.75 3.75 0 0 1 15.395 12H16.5a3 3 0 0 1 3 3v.105A3.75 3.75 0 0 0 15.395 12H14.25v-3.6A3.75 3.75 0 0 0 10.4 4.605v-1.5A3 3 0 0 1 14.25 0H15a3 3 0 0 1 3 3v.105A3.75 3.75 0 0 0 13.895 6H12.75v3.6A3.75 3.75 0 0 0 16.4 13.395v1.5A3 3 0 0 1 12.75 18H12a3 3 0 0 1-3-3v-.105A3.75 3.75 0 0 0 12.105 12H13.25v-3.6A3.75 3.75 0 0 0 9.6 4.605v-1.5A3 3 0 0 1 12.75 0H14.25v5.25Zm-6 10.5A3.75 3.75 0 0 1 12.395 12H13.5a3 3 0 0 1 3 3v.105A3.75 3.75 0 0 0 12.395 12H11.25v-3.6A3.75 3.75 0 0 0 7.4 4.605v-1.5A3 3 0 0 1 11.25 0H12a3 3 0 0 1 3 3v.105A3.75 3.75 0 0 0 10.895 6H9.75v3.6A3.75 3.75 0 0 0 13.4 13.395v1.5A3 3 0 0 1 9.75 18H9a3 3 0 0 1-3-3v-.105A3.75 3.75 0 0 0 9.105 12H10.25V8.4A3.75 3.75 0 0 0 6.6 4.605v-1.5A3 3 0 0 1 9.75 0H11.25v5.25A3.75 3.75 0 0 1 7.105 9H6a3 3 0 0 0-3 3v.105A3.75 3.75 0 0 1 7.105 15H8.25v-3.6A3.75 3.75 0 0 1 11.9 15.195v1.5A3 3 0 0 1 8.25 21H9a3 3 0 0 1-3-3v-.105A3.75 3.75 0 0 0 10.105 15H11.25V18.6A3.75 3.75 0 0 0 14.9 22.395v1.5A3 3 0 0 1 11.25 24H10.5a3 3 0 0 1-3-3v-.105A3.75 3.75 0 0 0 11.605 18H12.75v-3.6A3.75 3.75 0 0 0 9.1 10.605v-1.5A3 3 0 0 1 12.75 6H13.5a3 3 0 0 1 3 3v.105A3.75 3.75 0 0 0 12.395 12H11.25v3.6A3.75 3.75 0 0 0 14.9 19.395v1.5A3 3 0 0 1 11.25 24H8.25v-5.25A3.75 3.75 0 0 1 12.395 15H13.5a3 3 0 0 0 3-3v-.105A3.75 3.75 0 0 1 12.395 9H11.25v3.6A3.75 3.75 0 0 1 7.6 16.395v1.5A3 3 0 0 1 11.25 24h1.5a3 3 0 0 0 3-3v-.105A3.75 3.75 0 0 1 11.605 18H10.5v-3.6A3.75 3.75 0 0 1 14.1 10.605v-1.5A3 3 0 0 0 10.5 6H9.75a3 3 0 0 0-3 3v.105A3.75 3.75 0 0 1 10.895 15H12v3.6A3.75 3.75 0 0 1 8.25 22.395v1.5A3 3 0 0 0 11.25 24h3A3.75 3.75 0 0 0 18 20.395v-1.5A3 3 0 0 1 14.25 21H15a3 3 0 0 0 3-3v-.105A3.75 3.75 0 0 1 13.895 15H12.75v3.6A3.75 3.75 0 0 1 9.1 22.395v1.5A3 3 0 0 0 12.75 24h1.5a3 3 0 0 0 3-3v-.105A3.75 3.75 0 0 1 13.105 18H12V14.4A3.75 3.75 0 0 1 15.75 10.605v1.5a3 3 0 0 1-3.75 2.895H10.5a3 3 0 0 1-3-3v-.105A3.75 3.75 0 0 0 11.605 12H12.75V8.4A3.75 3.75 0 0 0 9.1 4.605v-1.5A3 3 0 0 0 5.25 6v12a3 3 0 0 0 3 3h1.5a3 3 0 0 0 3-3v-.105A3.75 3.75 0 0 1 10.895 15H12v3.6A3.75 3.75 0 0 1 8.25 22.395v1.5A3 3 0 0 0 11.25 24h1.5a3 3 0 0 0 3-3v-.105A3.75 3.75 0 0 1 13.105 18H12V14.4A3.75 3.75 0 0 1 15.75 10.605v1.5a3 3 0 0 1-3.75 2.895H10.5a3 3 0 0 1-3-3v-.105A3.75 3.75 0 0 0 11.605 12H12.75V8.4A3.75 3.75 0 0 0 9.1 4.605v-1.5A3 3 0 0 0 5.25 6v12a3 3 0 0 0 3 3h1.5a3 3 0 0 0 3-3v-.105A3.75 3.75 0 0 1 10.895 15H12v3.6A3.75 3.75 0 0 1 8.25 22.395v1.5A3 3 0 0 0 11.25 24h3.75a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H5.25A3 3 0 0 0 2.25 6v12a3 3 0 0 0 3 3h3.75v-5.25Z"
                />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Waste Analyzer</h1>
          <p className="text-zinc-400">Upload an image to identify waste and learn how to dispose of it.</p>
        </div>

        {/* Main Content Box */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8"
        >
          <div className="space-y-6">
            {/* Image Upload Area */}
            <div
              className="w-full h-64 border-2 border-dashed border-zinc-700 rounded-xl flex flex-col items-center justify-center text-zinc-500 cursor-pointer hover:border-[#e78a53] hover:text-[#e78a53] transition-colors"
              onClick={triggerFileInput}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/png, image/jpeg, image/webp"
              />
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Waste preview"
                  className="w-full h-full object-contain rounded-xl p-1"
                />
              ) : (
                <div className="flex flex-col items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-12 h-12 mb-2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm1.5-6a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                    />
                  </svg>
                  <span>Click to upload image</span>
                  <span className="text-xs">PNG, JPG, WEBP</span>
                </div>
              )}
            </div>

            {/* Analyze Button */}
            <button
              onClick={handleAnalyze}
              disabled={isLoading || !imageFile}
              className="w-full bg-[#e78a53] hover:bg-[#e78a53]/90 text-white font-medium py-3 rounded-xl transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                "Analyze Waste"
              )}
            </button>

            {/* Error Message */}
            {error && (
              <div className="bg-red-900/50 border border-red-700 text-red-300 p-3 rounded-lg text-center">{error}</div>
            )}
          </div>
        </motion.div>

        {/* This entire block will only render *after* a successful API call */}
        {analysisResult && (
          <>

            {/* Charts Grid */}
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Waste Type Pie Chart */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.25 }}
                className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-2xl p-6"
              >
                <h3 className="text-lg font-semibold text-white mb-4">Waste Composition</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      // DYNAMIC DATA
                      data={analysisResult.waste_composition}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {/* DYNAMIC DATA */}
                      {analysisResult.waste_composition.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#27272a",
                        border: "1px solid #52525b",
                        borderRadius: "8px",
                        color: "#fafafa",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 space-y-2">
                  {/* DYNAMIC DATA */}
                  {analysisResult.waste_composition.map((item) => (
                    <div key={item.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-zinc-300">{item.name}</span>
                      </div>
                      <span className="text-zinc-500 font-medium">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Disposal Trend */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-2xl p-6"
              >
                <h3 className="text-lg font-semibold text-white mb-4">Disposal Trends</h3>
                <ResponsiveContainer width="100%" height={280}>
                  {/* DYNAMIC DATA */}
                  <AreaChart data={analysisResult.disposal_trends}>
                    <defs>
                      <linearGradient id="colorHome" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#e78a53" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#e78a53" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorIndustrial" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d97c3a" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#d97c3a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#52525b" />
                    <XAxis dataKey="month" stroke="#a1a1aa" />
                    <YAxis stroke="#a1a1aa" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#27272a",
                        border: "1px solid #52525b",
                        borderRadius: "8px",
                        color: "#fafafa",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="home"
                      stroke="#e78a53"
                      fillOpacity={1}
                      fill="url(#colorHome)"
                      name="Home"
                    />
                    <Area
                      type="monotone"
                      dataKey="industrial"
                      stroke="#d97c3a"
                      fillOpacity={1}
                      fill="url(#colorIndustrial)"
                      name="Industrial"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </motion.div>
            </div>

            {/* Recycling Rate Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35 }}
              className="mt-6 bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-2xl p-6"
            >
              <h3 className="text-lg font-semibold text-white mb-4">Recycling Rates</h3>
              <ResponsiveContainer width="100%" height={280}>
                {/* DYNAMIC DATA */}
                <BarChart data={analysisResult.recycling_rates}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#52525b" />
                  <XAxis dataKey="category" stroke="#a1a1aa" />
                  <YAxis stroke="#a1a1aa" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#27272a",
                      border: "1px solid #52525b",
                      borderRadius: "8px",
                      color: "#fafafa",
                    }}
                  />
                  <Bar dataKey="rate" fill="#e78a53" radius={[8, 8, 0, 0]} name="Recycling Rate (%)" />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Results Section (for the specific item) */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="mt-8 bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8"
            >
              <div className="space-y-6">
                <div>
                  <h2 className="text-sm font-semibold text-[#e78a53] uppercase tracking-wide">
                    Analyzed Item
                  </h2>
                  {/* DYNAMIC DATA */}
                  <p className="text-2xl font-bold text-white mt-1">{analysisResult.waste_type}</p>
                </div>

                <div className="w-full border-t border-zinc-800" />

                <div>
                  <h2 className="text-sm font-semibold text-[#e78a53] uppercase tracking-wide">Home Treatment</h2>
                  {/* DYNAMIC DATA */}
                  <p className="text-zinc-300 mt-2 leading-relaxed">{analysisResult.home_treatment}</p>
                </div>

                <div className="w-full border-t border-zinc-800" />

                <div>
                  <h2 className="text-sm font-semibold text-[#e78a53] uppercase tracking-wide">Industry Treatment</h2>
                  {/* DYNAMIC DATA */}
                  <p className="text-zinc-300 mt-2 leading-relaxed">{analysisResult.industry_treatment}</p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </motion.div>
    </div>
  )
}