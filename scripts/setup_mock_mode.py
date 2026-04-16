#!/usr/bin/env python3
"""
🧪 STT System - Mock Mode Toggle Utility
Quickly switch between real API and mock mode for testing

Usage:
    python scripts/setup_mock_mode.py --enable       # Enable mock mode
    python scripts/setup_mock_mode.py --disable      # Disable mock mode (use real APIs)
    python scripts/setup_mock_mode.py --status       # Show current status
"""

import os
import sys
import argparse
from pathlib import Path


def get_env_file():
    """Get path to .env file"""
    return Path(__file__).parent.parent / '.env'


def read_env():
    """Read .env file as dictionary"""
    env_file = get_env_file()
    env_dict = {}
    
    if env_file.exists():
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    if '=' in line:
                        key, value = line.split('=', 1)
                        env_dict[key] = value
    
    return env_dict


def write_env(env_dict):
    """Write .env file from dictionary"""
    env_file = get_env_file()
    
    with open(env_file, 'w') as f:
        f.write("# STT Final Summary - Environment Configuration\n")
        f.write("# Azure Speech Services (STT Model 1)\n")
        
        for key, value in env_dict.items():
            f.write(f"{key}={value}\n")


def enable_mock_mode():
    """Enable mock mode"""
    env_dict = read_env()
    env_dict['MOCK_MODE'] = 'true'
    write_env(env_dict)
    
    print("\n" + "="*70)
    print("✅ MOCK MODE ENABLED")
    print("="*70)
    print("\n🧪 Testing Configuration:")
    print("  • Using simulated STT responses (no real API calls)")
    print("  • Model 1 (Azure): 91% confidence")
    print("  • Model 2 (Whisper): 88% confidence")
    print("  • Model 3 (MAI): 93% confidence")
    print("\n💡 You can now test the complete workflow without network!")
    print("\n📌 Next steps:")
    print("  1. Place test audio in: input/audio_files/")
    print("  2. Run: python run.py watch")
    print("  3. Check output in: output/stt_final/")
    print("\n⚠️  Remember to disable mock mode when you want to use real APIs!")
    print("="*70 + "\n")


def disable_mock_mode():
    """Disable mock mode"""
    env_dict = read_env()
    env_dict['MOCK_MODE'] = 'false'
    write_env(env_dict)
    
    print("\n" + "="*70)
    print("✅ MOCK MODE DISABLED")
    print("="*70)
    print("\n🌐 Real API Configuration:")
    print("  • Using actual STT service providers")
    print("  • Model 1: Microsoft Azure Speech Services")
    print("  • Model 2: Docker Whisper API (192.168.10.19:8100)")
    print("  • Model 3: MAI Transcribe API")
    print("\n📌 Requirements:")
    print("  • Network connection to Azure")
    print("  • Whisper server running on 192.168.10.19:8100")
    print("  • MAI Speech API accessible")
    print("\n⚠️  If any service is unreachable, enable mock mode for testing!")
    print("="*70 + "\n")


def show_status():
    """Show current mock mode status"""
    env_dict = read_env()
    mock_mode = env_dict.get('MOCK_MODE', 'false')
    
    print("\n" + "="*70)
    print("📊 STT System Status")
    print("="*70)
    
    if mock_mode.lower() == 'true':
        print("\n🧪 MOCK MODE: ✅ ENABLED")
        print("   Using simulated API responses for testing")
        print("\n   Mock Responses:")
        print(f"   • Azure: {env_dict.get('MOCK_AZURE_RESPONSE', 'Default mock response')[:60]}...")
        print(f"   • Whisper: {env_dict.get('MOCK_WHISPER_RESPONSE', 'Default mock response')[:60]}...")
        print(f"   • MAI: {env_dict.get('MOCK_MAI_RESPONSE', 'Default mock response')[:60]}...")
    else:
        print("\n🌐 MOCK MODE: ❌ DISABLED")
        print("   Using real API services")
        print("\n   API Configuration:")
        print(f"   • Azure Speech: {env_dict.get('AZURE_SPEECH_KEY', 'NOT SET')[:20]}...")
        print(f"   • Whisper: {env_dict.get('EXTERNAL_WHISPER_ENDPOINT', 'NOT SET')}")
        print(f"   • MAI Speech: {env_dict.get('MAI_SPEECH_ENDPOINT', 'NOT SET')}")
    
    print("\n" + "="*70 + "\n")


def main():
    parser = argparse.ArgumentParser(
        description='Toggle Mock Mode for STT System',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/setup_mock_mode.py --enable
  python scripts/setup_mock_mode.py --disable
  python scripts/setup_mock_mode.py --status
        """
    )
    
    parser.add_argument('--enable', action='store_true',
                        help='Enable mock mode (use simulated responses)')
    parser.add_argument('--disable', action='store_true',
                        help='Disable mock mode (use real APIs)')
    parser.add_argument('--status', action='store_true',
                        help='Show current mock mode status')
    
    args = parser.parse_args()
    
    if not args.enable and not args.disable and not args.status:
        parser.print_help()
        return
    
    if args.enable:
        enable_mock_mode()
    elif args.disable:
        disable_mock_mode()
    elif args.status:
        show_status()


if __name__ == '__main__':
    main()
