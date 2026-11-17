ARCHS = arm64
TARGET = iphone:clang:16.5:15.0

include $(THEOS)/makefiles/common.mk

APPLICATION_NAME = Aura
Aura_FILES = main.m AppDelegate.m
Aura_FRAMEWORKS = UIKit WebKit
Aura_CFLAGS = -fobjc-arc
Aura_RESOURCE_DIRS = Resources

include $(THEOS_MAKE_PATH)/application.mk
